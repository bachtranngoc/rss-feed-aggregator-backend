const MongoClient = require('mongodb').MongoClient;
const Parser = require('rss-parser');
const _ = require('lodash');
const config = require('../../../config');

const updateFeeds = (req, res) => {
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;
    const url = `mongodb+srv://${dbUser}:${dbPassword}@cluster0-vpjdh.mongodb.net/test?retryWrites=true&w=majority`;
    const client = new MongoClient(url, { useNewUrlParser: true });
    const lastUpdateCheck = new Date();
    var isValidRequest = true;
    var dataFromProviders = [];
    var db;

    client.connect()
        .then((client) => {
            db = client.db('rssFeedAggregator');
            return db.collection('feedUpdateLog').find({}).toArray();
        }).then((result) => {
            if (result && result.length > 0) {
                console.log('last update time: ', result[0].lastFeedsUpdate);
                const lastUpdateTime = result[0].lastFeedsUpdate.getTime();
                const currentTime = Date.now();
                const durationInMinutes = (currentTime - lastUpdateTime) / 1000 / 60;
                console.log('last update time: ', lastUpdateTime);
                console.log('current time: ', currentTime);
                console.log('Minutes from last update: ', durationInMinutes);
                if (durationInMinutes < config.minutesBetweenUpdates) {
                    const errorMessage = 'shortest interval for update requests is 10 minutes';
                    res.status(429).send({
                        error: errorMessage
                    });
                    isValidRequest = false;
                    throw Error(errorMessage);
                }
            }
        }).then(() => {
            console.log('No previous update detected');
            const currentDate = new Date().getDate();
            var removeBeforeDate = new Date();
            removeBeforeDate.setDate(currentDate - 30);
            removeBeforeDate = removeBeforeDate.toISOString();
            return db.collection('feedRecords').deleteMany({ isoDate: { $lte: removeBeforeDate } });
        }).then((result) => {
            //This code area gets feeds from all sources
            console.log('Old records deleted: ', result.deletedCount);
            const parser = new Parser({
                defaultRSS: 2.0,
                customFields: {
                    feed: [['subtitle', 'description'], ['atom10:link', 'feedUrl'], ['pubDate', 'lastBuildDate']],
                    item: [['media:thumbnail', 'thumbnail'], ['media:content', 'thumbnail']]
                }
            });
            return Promise.all([
                parser.parseURL(config.feed1),
                parser.parseURL(config.feed2),
                parser.parseURL(config.feed3),
                parser.parseURL(config.feed4),
                parser.parseURL(config.feed5),
                db.collection('feedRecords').find({}).toArray()]);
        }).then((result) => {
            //insert records which are new and pubDate < 30 days
            console.log('Number of feed sources parsed: ', result.length - 1)
            console.log('Number of feed records in db: ', result[result.length - 1].length);

            for (let i = 0; i < result.length - 1; i++) {
                let resultString = JSON.stringify(result[i]);
                resultString = resultString.replace(/"\$"\:/g, '"attributes":');
                dataFromProviders.push(JSON.parse(resultString));
            }
            const feedsFromDB = result[result.length - 1];
            const currentDate = new Date().getDate();
            const oneMonthAgoDate = new Date();
            oneMonthAgoDate.setDate(currentDate - 30);
            var feedsToInsert = [];
            dataFromProviders.forEach((feedData) => {
                feedsToInsert = feedsToInsert.concat(feedData.items);
            });
            feedsToInsert = feedsToInsert.filter((feedToInsert) => {
                const publishDate = new Date(feedToInsert.isoDate);
                const isNewFeed = feedsFromDB.every((feedFromDB) => {
                    return feedToInsert.link !== feedFromDB.link;
                });
                return ((publishDate > oneMonthAgoDate) && isNewFeed);
            });
            if (feedsToInsert.length > 0) {
                return db.collection('feedRecords').insertMany(feedsToInsert);
            }
        }).then((result) => {
            if (result && result.insertedCount) {
                console.log('Inserted feed records: ', result.insertedCount);
            } else {
                console.log('Inserted feed records: 0');
            }
            return db.collection('feedProviders').deleteMany({});
        }).then((result) => {
            console.log('Providers row deleted: ', result.deletedCount);
            var providersToInsert = [];
            const selectedAttributes = ['title', 'feedUrl', 'description', 'image', 'pubDate', 'link', 'lastBuildDate'];
            dataFromProviders.forEach((feedData) => {
                var latestRecordDate;
                var providerObject = _.pick(feedData, selectedAttributes);
                if (feedData.items.length > 0) {
                    latestRecordDate = new Date(feedData.items[0].isoDate);
                    feedData.items.forEach((feed) => {
                        const feedDate = new Date(feed.isoDate);
                        if (latestRecordDate < feedDate) {
                            latestRecordDate = feedDate;
                        }
                    });
                }
                providerObject.latestRecordDate = latestRecordDate;
                providerObject.lastUpdateCheck = lastUpdateCheck;
                providerObject.recordsFound = feedData.items.length;
                providerObject.error = '';
                providersToInsert.push(providerObject);
            });
            return db.collection('feedProviders').insertMany(providersToInsert);
        }).then((result) => {
            console.log('Feed Providers rows inserted: ', result.insertedCount);
        }).then(() => {
            return db.collection('feedUpdateLog').deleteMany({});
        }).then((result) => {
            console.log('feed update log deleted: ', result.deletedCount);
            return db.collection('feedUpdateLog').insertOne({ lastFeedsUpdate: lastUpdateCheck });
        }).then((result) => {
            console.log('Records inserted to feedUpdateLog: ', result.insertedCount);
            res.status(200).send({
                success: 'successfully update feed records!'
            });
            if (client.isConnected()) {
                client.close();
            }
        }).catch((error) => {
            console.log('Error: ', error);
            if (isValidRequest) {
                res.status(500).send({
                    error: error
                });
            }
            if (client.isConnected()) {
                client.close();
            }
        });
};

const action = {
    updateFeeds: updateFeeds
};

module.exports = action;
