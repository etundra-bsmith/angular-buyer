var router = require('express').Router();
var q = require('q');
var mandrill = require('mandrill-api/mandrill');
var config = require('./config/mandrill');
var dateformat = require('dateformat');

router.route('/negativebalance')
    .post(function(req, res) {
        var datesubmitted = new Date(req.body.Order.DateSubmitted);
        var data = {
            TemplateName: 'negative-balance',
            Recipient: req.body.Recipients,
            MergeVars: [
                {name: 'ORDERNUMBER', content: req.body.Order.ID},
                {name: 'BALANCENAME', content: req.body.Order.BudgetBalanceName},
                {name: 'BALANCE', content: req.body.Order.BudgetBalance},
                {name: 'DATESUBMITTED', content: dateformat(datesubmitted, 'longDate')},
                {name: 'FIRSTNAME', content: req.body.Order.FirstName},
                {name: 'LASTNAME', content: req.body.Order.LastName},
                {name: 'FROMUSERID', content: req.body.Order.UserID},
                {name: 'AMOUNT', content: req.body.Order.Total}
            ]
        };
        sendMandrillEmail(data)
            .then(function(result) {
                res.status(200).json({Data: result});
            })
            .catch(function(ex) {
                console.log(ex);
                res.status(400).json({Error: ex});
            });
    })
;

function sendMandrillEmail(data) {
    var deferred = q.defer();

    var mandrill_client = new mandrill.Mandrill(config.apiKey);

    var template_content = [{name: 'main', content: 'content'}];
    var message = {
        to: data.Recipient,
        global_merge_vars: data.MergeVars
    };

    if (config.sendEmails == 'true') {
        mandrill_client.messages.sendTemplate({template_name: data.TemplateName, template_content: template_content, message: message},
            function(result) {
                deferred.resolve(result);
            },
            function(error) {
                deferred.reject(error);
            }
        );
    }
    else {
        deferred.resolve([
            {
                "email": data.Recipient.Email,
                "status": "no-email-for-you",
                "_id": "not-production",
                "reject_reason": null
            }
        ])
    }

    return deferred.promise;
}

module.exports = router;