angular.module('orderCloud')
    .config(CategoryBrowseConfig)
    .controller('CategoryBrowseCtrl', CategoryBrowseController)
;

function CategoryBrowseConfig($stateProvider){
    $stateProvider
        .state('categoryBrowse', {
            parent:'base',
            url:'/browse/categories?categoryID&catalogID&productPage&categoryPage&pageSize&sortBy&filters',
            templateUrl:'categoryBrowse/templates/categoryBrowse.tpl.html',
            controller:'CategoryBrowseCtrl',
            controllerAs:'categoryBrowse',
            resolve: {
                Parameters: function($stateParams, ocParameters) {
                    return ocParameters.Get($stateParams);
                },
                CategoryList: function(OrderCloudSDK, Parameters, Catalogs, $q) {
                    if(!Parameters.filters) Parameters.filters = {};
                    var queue = [];
                    var isTopLevel = !Parameters.categoryID && !Parameters.catalogID;

                    Parameters.page = Parameters.categoryPage;
                    if(isTopLevel) { 
                        //to get all categories we'll need to do a list call from each catalog
                        _.each(Catalogs.Items, function(catalog){
                            Parameters.filters.catalogID = catalog.ID;
                            queue.push(function(){
                                return OrderCloudSDK.Me.ListCategories(Parameters)
                                    .then(function(categoryList){
                                        _.each(categoryList.Items, function(category){
                                            category.catalogID = catalog.ID;
                                        });
                                        return categoryList;
                                    });
                            }());
                        });
                    } else {
                        //they are in subview only need to get results for one catalog list call
                        Parameters.filters.ParentID = Parameters.categoryID;
                        queue.push(function(){
                            return OrderCloudSDK.Me.ListCategories(Parameters)
                                .then(function(categoryList){
                                    _.each(categoryList.Items, function(category){
                                        category.catalogID = Parameters.catalogID;
                                    });
                                    return categoryList;
                                });
                        }());
                    }

                    return $q.all(queue)
                        .then(function(results){
                            if(isTopLevel){
                                delete Parameters.filters.catalogID;
                                var Items = [];
                                var Meta = {
                                    'Page': 1,
                                    'PageSize': results[0].MetaPageSize,
                                    'TotalCount': 0,
                                    'TotalPages': 1,
                                    'ItemRange': [1]

                                };
                                _.each(results, function(result){
                                    Meta.TotalCount = Meta.TotalCount + result.Meta.TotalCount;
                                    Meta.ItemRange[1] = Meta.TotalCount > Meta.PageSize ? Meta.PageSize : Meta.TotalCount;
                                    Items = Items.concat(result.Items);
                                });
                                return {Items: Items, Meta: Meta};
                            } else {
                                return results[0];
                            }
                        });
                },
                ProductList: function(OrderCloudSDK, Parameters) {
                    if(Parameters && Parameters.filters && Parameters.filters.ParentID) {
                        delete Parameters.filters.ParentID;
                        Parameters.page = Parameters.productPage;
                        return OrderCloudSDK.Me.ListProducts(Parameters);
                    } else {
                        return null;
                    }
                },
                SelectedCategory: function(OrderCloudSDK, Parameters){
                    if(Parameters.categoryID){
                        var parameters = {
                            depth: 'all',
                            filters: {
                                ID: Parameters.categoryID,
                                catalogID: Parameters.catalogID
                            }
                        };
                        return OrderCloudSDK.Me.ListCategories(parameters)
                            .then(function(data){
                                return data.Items[0];
                            });
                        
                    } else {
                        return null;
                    }
                    
                }
            }
        });
}

function CategoryBrowseController($state, ocParameters, CategoryList, ProductList, Parameters, SelectedCategory) {
    var vm = this;
    vm.categoryList = CategoryList;
    vm.productList = ProductList;
    vm.parameters = Parameters;
    vm.selectedCategory = SelectedCategory;

    vm.getNumberOfResults = function(list){
        return vm[list].Meta.ItemRange[0] + ' - ' + vm[list].Meta.ItemRange[1] + ' of ' + vm[list].Meta.TotalCount + ' results';
    };

    vm.filter = function(resetPage) {
        $state.go('.', ocParameters.Create(vm.parameters, resetPage));
    };

    vm.updateCategoryList = function(category, catalogID){
        vm.parameters.catalogID = catalogID;
        vm.parameters.categoryID = category;
        vm.filter(true);
    };

    vm.changeCategoryPage = function(newPage){
        vm.parameters.categoryPage = newPage;
        vm.filter(false);
    };
    
    vm.changeProductPage = function(newPage){
        vm.parameters.productPage = newPage;
        vm.filter(false);
    };
}
