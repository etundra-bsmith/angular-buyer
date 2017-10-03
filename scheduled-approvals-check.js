var request = require('request');
var $q = require('q');
var boconfig = require('./routes/config/back-office-user');
var OrderCloudSDK = require('./routes/config/ordercloud');
var _ = require('underscore');
var fs = require('fs');
var dateformat = require('dateformat');
var buyerid = JSON.parse(fs.readFileSync('./src/app/app.constants.json')).buyerid;

var mandrill = require('mandrill-api/mandrill');
var mandrillConfig = require('./routes/config/mandrill');
var mandrill_client = new mandrill.Mandrill(mandrillConfig.apiKey);

/*  Config Error Handling   */
if(!buyerid) console.error(new Error('Please define buyerid in src/app/app.constants.json'));
if(!boconfig.ClientID) console.error(new Error('missing required ClientID for back office user'));
if(!boconfig.ClientSecret) console.error(new Error('missing required ClientSecret for back office user'));
if(!boconfig.scope) console.error(new Error('missing required scope for back office user'));


return setBackOfficeToken()
    .then(getOrdersAwaitingApproval)
    .then(getApprovingUsers)
    .then(function(emailData){
        return $q.all([
            emailUsers(emailData),
            markComplete(emailData)
        ]);
    });

function getOrdersAwaitingApproval(){
    //orders that have been on hold for at least 48 hours but have not been approved
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
    });
}

function getApprovingUsers(orders){
    // list of users for each order on hold that can approve it
    var emailData = {};
    var approvalQueue = [];
    _.each(orders.Items, function(order){
        approvalQueue.push(function(){
            return OrderCloudSDK.Orders.ListApprovals('incoming', order.ID, {filters: {Status: 'Pending'}})
                .then(function(approvals){
                    var usersQueue = [];
                    _.each(approvals.Items, function(approval){
                        usersQueue.push(function(){
                            return OrderCloudSDK.Users.List(buyerid, {pageSize: 100, userGroupID: approval.ApprovingGroupID})
                                .then(function(userList){
                                    order = _.pick(order, ['ID', 'FromUser', 'FromUserID', 'DateSubmitted']);
                                    var recipients = _.pluck(userList.Items, 'Email');
                                    return emailData[order.ID] = {
                                        Order: order,
                                        Recipients: recipients
                                    };
                                });
                        }());
                    });
                    return $q.all(usersQueue);
                });
        }());
    });
    return $q.all(approvalQueue)
        .then(function(){
            return emailData;
        });
}

function emailUsers(emailData){
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

        queue.push(mandrill_client.messages.sendTemplate({template_name: 'approval-over-48-hours', template_content: template_content, message: message}));
    });
    return $q.all(queue);
}

function markComplete(emailData){
    //set order.xp.Over48 = 'yes' to indicate users have been emailed a reminder
    var orderids = _.keys(emailData);
    var queue = [];
    _.each(orderids, function(orderid){
        return OrderCloudSDK.Orders.Patch('incoming', orderid, {xp: {Over48:'yes'}});
    });
    return $q.all(queue);
}

function setBackOfficeToken(){
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
            deferred.reject(error);
        } else {
            if(body && body.Errors && body.Errors.length){
                var msg = body.Errors[0].Message;
                console.log('Error Auth', msg);
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