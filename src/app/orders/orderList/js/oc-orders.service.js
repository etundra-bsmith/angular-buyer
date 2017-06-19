angular.module('orderCloud')
    .factory('ocOrders', ocOrdersService)
;

function ocOrdersService(OrderCloudSDK){
    var service = {
        List: _list
    };
    
    function _list(Parameters, CurrentUser){
        var parameters = angular.copy(Parameters);

        //exclude unsubmitted orders from list
        //parameters.filters = {Status: '!Unsubmitted'};  //TODO: replace this line with below once api can reverse filter enums (EX-1166)
        parameters.filters = {Status: 'Open|AwaitingApproval|Completed|Cancelled|Declined'};

        if(parameters.status){
            angular.extend(parameters.filters, {Status: parameters.status});
        }

        //set outgoing params to iso8601 format as expected by api
        //set returning params to date object as expected by uib-datepicker
        if(parameters.from) {
            var fromDateObj = new Date(parameters.from);
            Parameters.fromDate = fromDateObj;
            parameters.from = (fromDateObj).toISOString();
        }
        if(parameters.to) {
            var toDateObj = new Date(parameters.to);
            Parameters.toDate = toDateObj;
            parameters.to = (toDateObj).toISOString();
        }

        // DateSubmitted calculated with from/to parameters
        if(parameters.from && parameters.to) {
            parameters.filters.DateSubmitted = [('>' + parameters.from), ('<' + parameters.to)];
        } else if(parameters.from && !parameters.to) {
            parameters.filters.DateSubmitted = [('>' + parameters.from)];
        } else if (!parameters.from && parameters.to) {
            parameters.filters.DateSubmitted = [('<' + parameters.to)];
        }

        if(parameters.tab === 'favorites') {
            if(CurrentUser.xp && CurrentUser.xp.FavoriteOrders) {
                angular.extend(parameters.filters, {ID: CurrentUser.xp.FavoriteOrders.join('|')});
            }
        }

        if(parameters.tab === 'grouporders') {
            if(parameters.group) {
                return OrderCloudSDK.Me.ListAddresses()
                    .then(function(addresses) {
                        var shippingAddress = _.where(addresses.Items, {CompanyName: parameters.group});
                        parameters.filters = {ShippingAddressID: shippingAddress[0].ID, Status: parameters.status};
                        return OrderCloudSDK.Orders.List('Outgoing', parameters);
                    });
            } else {
                return [];
            }
        }

        // list orders with generated parameters
        if(parameters.tab === 'approvals') {
            return OrderCloudSDK.Me.ListApprovableOrders(parameters);
        } else if(parameters.tab === 'all') {
            return OrderCloudSDK.Orders.List('outgoing', parameters);
        } else {
            return OrderCloudSDK.Me.ListOrders(parameters);
        }
    }

    return service;
}