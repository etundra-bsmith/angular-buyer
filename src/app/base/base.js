angular.module('orderCloud')
    .config(BaseConfig)
    .controller('BaseCtrl', BaseController)
    .factory('NewOrder', NewOrderService)
;

function BaseConfig($stateProvider) {
    $stateProvider.state('base', {
        url: '',
        abstract: true,
        views: {
            '': {
                templateUrl: 'base/templates/base.tpl.html',
                controller: 'BaseCtrl',
                controllerAs: 'base'
            },
            'nav@base': {
                'templateUrl': 'base/templates/navigation.tpl.html'
            }
        },
        resolve: {
            Buyer: function(OrderCloudSDK){
                return OrderCloudSDK.Buyers.List({pageSize:1})
                    .then(function(buyerList){
                        return buyerList.Items[0];
                    });
            },
            Catalogs: function(OrderCloudSDK){
                return OrderCloudSDK.Me.ListCatalogs();
            },
            CurrentUser: function(OrderCloudSDK) {
                return OrderCloudSDK.Me.Get();
            },
            ExistingOrder: function(OrderCloudSDK) {
                return OrderCloudSDK.Me.ListOrders({sortBy:'!DateCreated', filters:{Status:'Unsubmitted'}})
                    .then(function(orderList) {
                        return orderList.Items[0];
                    });
            },
            CurrentOrder: function(ExistingOrder, NewOrder) {
                return !ExistingOrder ? NewOrder.Create({}) : ExistingOrder;
            },
            LineItemsList: function(OrderCloudSDK, CurrentOrder) {
                return OrderCloudSDK.LineItems.List('outgoing', CurrentOrder.ID);
            }
        }
    });
}

function BaseController($rootScope, $state, ProductSearch, CurrentUser, CurrentOrder, LineItemsList, OrderCloudSDK) {
    var vm = this;
    vm.currentUser = CurrentUser;
    vm.currentOrder = CurrentOrder;
    vm.lineItems = LineItemsList;

    vm.mobileSearch = function() {
        ProductSearch.Open()
            .then(function(data) {
                if (data.productID) {
                    $state.go('productDetail', {productid: data.productID});
                } else {
                    $state.go('productSearchResults', {searchTerm: data.searchTerm});
                }
            });
    };

    $rootScope.$on('OC:UpdateOrder', function(event, OrderID, message) {
        vm.orderLoading = {
            message: message
        };
        vm.orderLoading.promise = OrderCloudSDK.Orders.Get('outgoing', OrderID)
            .then(function(data) {
                vm.currentOrder = data;
                OrderCloudSDK.LineItems.List('outgoing', vm.currentOrder.ID)
                    .then(function(lineitems) {
                        vm.lineItems = lineitems;
                    })
            });
    });
}

function NewOrderService($q, OrderCloudSDK) {
    var service = {
        Create: _create
    };

    function _create() {
        var deferred = $q.defer();
        var order = {};

        //ShippingAddressID{pageSize: 100, filters: {Shipping: true}}
        OrderCloudSDK.Me.ListAddresses({pageSize: 100, filters: {Shipping: true}})
            .then(function(shippingAddresses) {
                if (shippingAddresses.Items.length) order.ShippingAddressID = shippingAddresses.Items[0].ID;
                setBillingAddress();
            });

        //BillingAddressID
        function setBillingAddress() {
            OrderCloudSDK.Me.ListAddresses({pageSize: 100, filters: {Billing: true}})
                .then(function(billingAddresses) {
                    if (billingAddresses.Items.length) order.BillingAddressID = billingAddresses.Items[0].ID;
                    createOrder();
                });
        }

        function createOrder() {
            order.xp = {
                ExpeditedShipping: "ground",
                sellerOrderID: 0,
                Over48: "no"
            };
            OrderCloudSDK.Orders.Create('outgoing', order)
                .then(function(order) {
                    var attempt = 0;
                    generateOrderNumber(order); //generates an order number in the form WXXXXXXX
                    
                    function generateOrderNumber(order){
                        var orderNumber = Math.floor((1000000 + Math.random() * 9000000)); //random # length 7 digits
                        OrderCloudSDK.Orders.Patch('outgoing', order.ID, {ID: 'W' + orderNumber})
                            .then(function(newOrder){
                                deferred.resolve(newOrder);
                            })
                            .catch(function(error){
                                if(attempt > 3) {
                                    deferred.resolve();
                                } else {
                                    //there was a conflict, generate a new random # and try again
                                    attempt++;
                                    generateOrderNumber(); 
                                }
                            });
                        }
                });
        }

        

        return deferred.promise;
    }

    return service;
}
