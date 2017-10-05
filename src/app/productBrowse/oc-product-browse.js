angular.module('orderCloud')
    .factory('ocProductBrowse', ocProductBrowseService)
;

function ocProductBrowseService($q, OrderCloudSDK, ocUtility){
    var service = {
        ListCategories: _listCategories,
        GetCategoryTree: _getCategoryTree
    };

    function _listCategories(Catalogs){
        var timeLastUpdated = 1507229588258;
        function onCacheEmpty(){
            var queue = [];
            _.each(Catalogs.Items, function(catalog){
                queue.push(function(){
                    return ocUtility.ListAll(OrderCloudSDK.Me.ListCategories, {depth:'all', catalogID: catalog.ID})
                        .then(function(categoryList){
                            _.each(categoryList.Items, function(category){
                                category.catalogID = catalog.ID;
                            });
                            return categoryList.Items;
                        });
                }());
            });
            return $q.all(queue)
                .then(function(results){
                    var categories = [];
                    _.each(results, function(result){
                        categories = categories.concat(result);
                    });
                    return categories;
                });
        }
        return ocUtility.GetCache('CategoryList', onCacheEmpty, timeLastUpdated);
    }

    function _getCategoryTree(CategoryList){
        var timeLastUpdated = 1507229588258;
        function onCacheEmpty(){
            return _buildTree(CategoryList);
        }
       return ocUtility.GetCache('CategoryTree', onCacheEmpty, timeLastUpdated);
    }

    function _buildTree(CategoryList){
        var result = [];
        angular.forEach(_.where(CategoryList, {ParentID: null}), function(node) {
            result.push(getnode(node));
        });
        function getnode(node) {
            var children = _.where(CategoryList, {ParentID: node.ID});
            if (children.length > 0) {
                node.children = children;
                angular.forEach(children, function(child) {
                    return getnode(child);
                });
            } else {
                node.children = [];
            }
            return node;
        }
        return $q.when(result);
    }

    return service;
}