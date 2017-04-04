angular.module('orderCloud')
    .config(CartConfig)
    .controller('CartCtrl', CartController)
;

function CartConfig($stateProvider) {
    $stateProvider
        .state('cart', {
            parent: 'base',
            url: '/cart',
            templateUrl: 'cart/templates/cart.tpl.html',
            controller: 'CartCtrl',
            controllerAs: 'cart',
            data: {
                pageTitle: "Shopping Cart"
            },
            resolve: {
                LineItemsList: function($q, $state, toastr, OrderCloud, ocLineItems, CurrentOrder) {
                    var dfd = $q.defer();
                    OrderCloud.LineItems.List(CurrentOrder.ID)
                        .then(function(data) {
                            if (!data.Items.length) {
                                dfd.resolve(data);
                            }
                            else {
                                ocLineItems.GetProductInfo(data.Items)
                                    .then(function() {
                                        dfd.resolve(data);
                                    });
                            }
                        })
                        .catch(function() {
                            toastr.error('Your order does not contain any line items.', 'Error');
                            dfd.reject();
                        });
                    return dfd.promise;
                },
                CurrentPromotions: function(CurrentOrder, OrderCloud, AddRebate) {
                    return AddRebate.ApplyPromo(CurrentOrder)
                        .then(function(){
                            return OrderCloud.Orders.ListPromotions(CurrentOrder.ID);
                        });
                }
            }
        });
}

function CartController($rootScope, $state, toastr, OrderCloud, LineItemsList, CurrentPromotions, CurrentOrder, ocConfirm, AddRebate, rebateCode) {
    var vm = this;
    vm.lineItems = LineItemsList;
    vm.promotions = CurrentPromotions.Meta ? CurrentPromotions.Items : CurrentPromotions;
    vm.rebateCode = rebateCode;

    vm.updatePromo = updatePromo;
    vm.removeItem = removeItem;
    vm.removePromotion = removePromotion;
    vm.cancelOrder = cancelOrder;

    function updatePromo(){
        return AddRebate.ApplyPromo(CurrentOrder);
    }

    function removeItem(order, scope) {
        vm.lineLoading = [];
        vm.lineLoading[scope.$index] = OrderCloud.LineItems.Delete(order.ID, scope.lineItem.ID)
            .then(function () {
                vm.lineItems.Items.splice(scope.$index, 1);
                $rootScope.$broadcast('OC:UpdateOrder', order.ID);
                return AddRebate.ApplyPromo(order)
                    .then(function() {
                        $rootScope.$broadcast('OC:UpdateOrder', order.ID);
                        toastr.success('Line Item Removed');
                    })
            });
    }

    //TODO: missing unit tests
    function removePromotion(order, scope) {
        OrderCloud.Orders.RemovePromotion(order.ID, scope.promotion.Code)
            .then(function() {
                $rootScope.$broadcast('OC:UpdateOrder', order.ID);
                vm.promotions.splice(scope.$index, 1);
            });
    }

    function cancelOrder(order){
        return ocConfirm.Confirm({
                message:'Are you sure you want to cancel this order?',
                confirmText: 'Yes, cancel order',
                type: 'delete'})
            .then(function() {
                return OrderCloud.Orders.RemovePromotion(order.ID, vm.rebateCode)
                    .then(function() {
                        $rootScope.$broadcast('OC:UpdatePromotions', order.ID);
                        return OrderCloud.Orders.Delete(order.ID)
                            .then(function(){
                                $state.go("home",{}, {reload:'base'})
                            });
                    })
            });
    }

    //TODO: missing unit tests
    $rootScope.$on('OC:UpdatePromotions', function(event, orderid) {
        return OrderCloud.Orders.ListPromotions(orderid)
            .then(function(data) {
                if (data.Meta) {
                    vm.promotions = data.Items;
                } else {
                    vm.promotions = data;
                }
            });
    });
}