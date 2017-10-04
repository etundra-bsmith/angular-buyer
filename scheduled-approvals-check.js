var request = require('request');
var $q = require('q');
var boconfig = require('./routes/config/back-office-user');
var OrderCloudSDK = require('./routes/config/ordercloud');
var _ = require('underscore');
var dateformat = require('dateformat');
var chalk = require('chalk');
var mandrill = require('mandrill-api/mandrill');
var mandrillConfig = require('./routes/config/mandrill');
var mandrill_client = new mandrill.Mandrill(mandrillConfig.apiKey);

/* * * Documentation * * *

This scheduled process looks for any orders that have been on hold 
for more than 48 hours and sends an email reminder to the approving users
ignoring any user that has already been reminded. It gets kicked off hourly 
by a free Heroku add-on called Heroku-scheduler - https://elements.heroku.com/addons/scheduler

for security purposes a backoffice user with limited roles is used
for this task. configuration of the user is stored remotely on heroku 
(via config variables). More information about what is required to configure 
the back-office user can be found in ./routes/config/back-office-user.js

troubleshooting is pretty easy just run 'scheduled-approvals-check.js'
while in the project directory. 

If you need to run the deployed instance of the code locally you can do so as 
well - you'll just need to make sure you have the heroku cli installed 
(https://devcenter.heroku.com/articles/heroku-cli) then just enter the following 
command:

`heroku run command --app appname`

at the time of writing it would be the following although appname might change

'heroku run node scheduled-approvals-check --app caferio-production'

/* * * * * * * * * * * * */

cLog('Verifying Config');
if(!boconfig.ClientID) return cError('Missing ClientID for back office user from routes/config/back-office-user - EXIT PROCESS');
if(!boconfig.ClientSecret) return cError('Missing ClientSecret for back office user from routes/config/back-office-user - EXIT PROCESS');
if(!boconfig.scope) return cError('Missing scope for back office user from routes/config/back-office-user - EXIT PROCESS');

return setBackOfficeToken()
    .then(getOrdersAwaitingApproval)
    .then(getApprovingUsers)
    .then(function(emailData){
        return emailUsers(emailData)
            .then(function(){
                return markComplete(emailData);
            });
    });

function getOrdersAwaitingApproval(){
    cLog('Retrieving orders that have been on hold > 48 hours and have no reminders sent');
    var now = new Date();
    now.setHours(now.getHours() - 48);
    var fortyEightHoursAgo = now.toISOString();

    return OrderCloudSDK.Orders.List('incoming', {
        pageSize: 100, 
        filters: {
            Status: 'AwaitingApproval', 
            DateSubmitted: '<' + fortyEightHoursAgo,
            'xp.Over48': 'no' // user has not yet been reminded
        }
    })
    .then(function(orderList){
        var orderids = _.pluck(orderList.Items, 'ID').join(',');
        if(orderids.length === 0){
            cSuccess('No orders were found - EXIT PROCESS');
            return $q.reject();
        } else {
            cSuccess(orderList.Meta.TotalCount + ' Orders Found', 'orderIDs: ' + orderids);
            return orderList;
        }
    });
}

function getApprovingUsers(orders){
    cLog('Retrieve list of approving users for each order');
    var emailData = {};
    var approvalQueue = [];
    _.each(orders.Items, function(order){
        approvalQueue.push(function(){
            return OrderCloudSDK.Orders.ListApprovals('incoming', order.ID, {filters: {Status: 'Pending'}})
                .then(function(approvals){
                    cSuccess('Order Approvals for ' + order.ID + ' retrieved');
                    var usersQueue = [];
                    _.each(approvals.Items, function(approval){
                        usersQueue.push(function(){
                            return OrderCloudSDK.Users.List(order.FromCompanyID, {pageSize: 100, userGroupID: approval.ApprovingGroupID})
                                .then(function(userList){
                                    cSuccess('Successfully retrieved Users in approving group ' +  approval.ApprovingGroupID);
                                    order = _.pick(order, ['ID', 'FromUser', 'FromUserID', 'DateSubmitted']);
                                    var recipients = _.pluck(userList.Items, 'Email');
                                    return emailData[order.ID] = {
                                        Order: order,
                                        Recipients: recipients
                                    };
                                })
                                .catch(function(){
                                    cError('Failed to retrieve Users in Approving Group: ' + approval.ApprovingGroupID);
                                    return $q.reject();
                                });
                        }());
                    });
                    return $q.all(usersQueue);
                })
                .catch(function(){
                    cError('Failed to retrieve Approvals for ' + order.ID);
                    return $q.reject();
                });
        }());
    });
    return $q.all(approvalQueue);
}

function emailUsers(emailData){
    cLog('Building up emails');
    var queue = [];
    _.each(emailData, function(email){
        var arrayRecipients = _.map(email.Recipients, function(email){
            return {email: email, type: 'to'};
        });
        var datesubmitted = new Date(email.Order.DateSubmitted);
        var message = {
            to: arrayRecipients,
            global_merge_vars: [
                {name: 'OrderID', content: email.Order.ID},
                {name: 'DATESUBMITTED', content: dateformat(datesubmitted, 'longDate')},
                {name: 'FIRSTNAME', content: email.Order.FromUser.FirstName},
                {name: 'LASTNAME', content: email.Order.FromUser.LastName},
                {name: 'FROMUSERID', content: email.Order.FromUserID}
            ]
        };
        var template_content = [{name: 'main', content: 'content'}];

        queue.push(function(){
            var dfd = $q.defer();
            mandrill_client.messages.sendTemplate({template_name: 'approval-over-48-hours', template_content: template_content, message: message},
                function(result) {
                    cSuccess('Emails successfully sent to: ' + email.Recipients.join(','));
                    dfd.resolve(result);
                },
                function() {
                    cError('Emails not sent to: ' + email.Recipients.join(','));
                }
            );
            return dfd.promise;
        }());
    });
    return $q.all(queue);
}

function markComplete(emailData){
    //set order.xp.Over48 = 'yes' to indicate users have been emailed a reminder
    var orderids = _.keys(emailData);
    var queue = [];
    _.each(orderids, function(orderid){
        queue.push(function(){
            return OrderCloudSDK.Orders.Patch('incoming', orderid, {xp: {Over48:'yes'}})
                .then(function(){
                    cSuccess('Order Marked Complete ' + orderid);
                })
                .catch(function(){
                    cSuccess('Failure Marking Complete ' + orderid);
                });
        }());
    });
    return $q.all(queue)
        .then(function(){
            cSuccess('PROCESS COMPLETE');
        });
}

function setBackOfficeToken(){
    cLog('Authenticating');
    //TODO: there is a bug in javascript sdk that doesnt allow us
    //to use OrderCloudSDK.Auth.ClientCredentials log in. once this
    //is fixed replace with that call
    var deferred = $q.defer();
    var requestBody = {
        url:  OrderCloudSDK.ApiClient.instance.baseAuthPath + '/oauth/token',
        headers: {
            'Content-Type': 'application/json'
        },
        body: 'client_id=' + boconfig.ClientID + '&grant_type=client_credentials&client_secret=' + boconfig.ClientSecret + '&scope=' + boconfig.scope.join('+')
    };

    request.post(requestBody, function (error, response, body) {
        if (error) {
            cError('Failure - EXIT PROCESS');
            deferred.reject(error);
        } else {
            if(body && body.Errors && body.Errors.length){
                var msg = body.Errors[0].Message;
                cError('Auth Error - confirm back-office-user information is correct', msg);
                deferred.reject(msg);
            } else {
                var token = JSON.parse(body)['access_token'];
                OrderCloudSDK.SetToken(token);
                deferred.resolve();
            }
        }
    });

    return deferred.promise;
}

/* * * Logging Helpers * * */

function cLog(message, code) {
    console.log(chalk.magentaBright('[DFSS Scheduled Approval Reminder] ') + chalk.cyanBright(message), code ? code : '');
}
function cSuccess(message, code) {
    console.log(chalk.magentaBright('[DFSS Scheduled Approval Reminder] ') + chalk.greenBright(message), code ? code : '');
}
function cError(message, code) {
    console.log(chalk.magentaBright('[DFSS Scheduled Approval Reminder] ') + chalk.redBright(message), code ? code : '');
}