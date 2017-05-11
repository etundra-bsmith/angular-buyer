var request = require('request');
var q = require('q');
var mandrill = require('mandrill-api/mandrill');
var config = require('./mandrill.config');

function sendMandrillEmail() {
    console.log('config', config);
    var deferred = q.defer();

    var mandrill_client = new mandrill.Mandrill(config.apiKey);

    var template_content = [{name: 'main', content: 'content'}];
    var message = {
        to: [{email: 'cramirez@four51.com', type: 'to'}],
        global_merge_vars: null
    };

    mandrill_client.messages.sendTemplate({template_name: 'negative-balance', template_content: template_content, message: message},
        function(result) {
            console.log(result);
        },
        function(error) {
            console.log(error);
        }
    );

    return deferred.promise;
}

sendMandrillEmail()
    .then(function(data){
        console.log('data', data);
        console.log('hit')
    })
    .catch(function(err){
        console.log('err', err);
        console.log('err hit');
    })