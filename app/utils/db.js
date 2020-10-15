const MongoClient = require('mongodb').MongoClient;

const getClient = () => {
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;
    const url = `mongodb+srv://${dbUser}:${dbPassword}@cluster0-vpjdh.mongodb.net/test?retryWrites=true&w=majority`;
    return new MongoClient(url, { useNewUrlParser: true });
};

module.exports = {
    getClient: getClient
};
