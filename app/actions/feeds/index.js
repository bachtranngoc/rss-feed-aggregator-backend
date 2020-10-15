const mongoDB = require('../../utils/db');
const Parser = require('rss-parser');
const _ = require('lodash');
const config = require('../../../config');
const messages = require('../../../messages');

const parseAllFeedSources = () => {
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
        parser.parseURL(config.feed5)]);
};

const standardizeFeedRecords = (result, dataFromProviders, lastUpdateCheck) => {
    for (let i = 0; i < result.length; i++) {
        result[i].items.forEach((feed) => {
            feed.feedProvider = result[i].title;
            feed.detectedDate = lastUpdateCheck;
        });
        let resultString = JSON.stringify(result);
        resultString = resultString.replace(/"\$"\:/g, '"attributes":');
        dataFromProviders.push(JSON.parse(resultString));
    }
};

const handleTooSoonUpdate = (result, res) => {
    if (result && result.length > 0) {
        const lastUpdateTime = result[0].lastFeedsUpdate.getTime();
        const currentTime = Date.now();
        const durationInMinutes = (currentTime - lastUpdateTime) / 1000 / 60;
        if (durationInMinutes < config.minutesBetweenUpdates) {
            res.status(429).send({
                error: messages.updateTooSoonError
            });
            isValidRequest = false;
            throw Error();
        }
    }
};

const insertNewFeedRecords = (db, feedsFromDB, dataFromProviders) => {
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
        return db.collection(config.feedRecordsCollection).insertMany(feedsToInsert);
    }
};

const insertFeedProviders = (db, dataFromProviders, lastUpdateCheck) => {
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
    return db.collection(config.feedProvidersCollection).insertMany(providersToInsert);
};

const deleteRecordsOlderThanAMonth = (db) => {
    const currentDate = new Date().getDate();
    var removeBeforeDate = new Date();
    removeBeforeDate.setDate(currentDate - 30);
    removeBeforeDate = removeBeforeDate.toISOString();
    return db.collection(config.feedRecordsCollection).deleteMany({ isoDate: { $lte: removeBeforeDate } });
};

const handleUpdateError = (res, isValidRequest, error) => {
    if (isValidRequest) {
        res.status(500).send({
            error: error
        });
    }
};

const handleUpdateSuccess = (res) => {
    res.status(200).send({
        success: messages.updateFeedsSuccess
    });
};

const updateFeeds = (req, res) => {
    const client = mongoDB.getClient();
    const lastUpdateCheck = new Date();
    var isValidRequest = true;
    var dataFromProviders = [];
    var db;

    client.connect()
        .then((client) => {
            db = client.db(config.dbName);
            return db.collection(config.feedUpdateLogCollection).find({}).toArray();
        }).then((result) => {
            handleTooSoonUpdate(result, res);
        }).then(() => {
            return deleteRecordsOlderThanAMonth(db);
        }).then(() => {
            return parseAllFeedSources();
        }).then((result) => {
            standardizeFeedRecords(result, dataFromProviders, lastUpdateCheck);
            return db.collection(config.feedRecordsCollection).find({}).toArray();
        }).then((feedsFromDB) => {
            return insertNewFeedRecords(db, feedsFromDB, dataFromProviders);
        }).then(() => {
            return db.collection(config.feedProvidersCollection).deleteMany({});
        }).then(() => {
            return insertFeedProviders(db, dataFromProviders, lastUpdateCheck);
        }).then(() => {
            return db.collection(config.feedUpdateLogCollection).deleteMany({});
        }).then(() => {
            return db.collection(config.feedUpdateLogCollection).insertOne({ lastFeedsUpdate: lastUpdateCheck });
        }).then(() => {
            handleUpdateSuccess(res);
        }).catch((error) => {
            handleUpdateError(res, isValidRequest, error);
        }).finally(() => {
            if (client.isConnected()) {
                client.close();
            }
        });
};

const action = {
    updateFeeds: updateFeeds
};

module.exports = action;
