/*
    This back-office user must be configured on ordercloud and should have a security profile
    with the roles defined below on scope. These fields should not be hardcoded here but rather
    stored remotely (Heroku or other deployed instance)

    Role Usage Description:

    Unsubmitted OrderReader - to get a list of orders with a status 'AwaitingApproval'
    UserGroupReader - to get a list of approval user groups
    BuyerUserReader - to get a list of users within approval user groups
    OrderAdmin - to patch xp on order (lets us know user has been emailed a reminder)
*/

module.exports = {
    ClientID: process.env.BACKEND_CLIENT || '9E09761E-D5F8-42EF-B511-552D540AE31B',
    ClientSecret: process.env.CLIENT_SECRET || 'w3bM3th0dsCli3nt',
    scope: ['UnsubmittedOrderReader', 'UserGroupReader', 'BuyerUserReader', 'OrderAdmin']
};

