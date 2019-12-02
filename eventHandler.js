const event = require("events");
const game = new event.EventEmitter();
let timeLimit;
//const MongoClient = require("mongodb").MongoClient;
//const auth = require("./auth.json");
//const mongoclient = new MongoClient(`mongodb+srv://${auth.mongoName}:${auth.mongoPass}@discord-uno-bot-oxf4l.mongodb.net/test?retryWrites=true&w=majority`, { useNewUrlParser: true, useUnifiedTopology: true });

//let db;
/*
mongoclient.connect()
    .catch(err => console.err)
    .then((thing) => {
        console.log(thing);
        db = mongoclient.db("gameRules").collection("rules");
        async function dbGet(obj) {
            return await db.find(obj).toArray();
        }
        async function dbSet() {
            if (arguments.length === 1) return await db.insertOne(arguments[0]);
            return await db.insertMany(arguments);
        }
        console.log("Retrieved Mongo db successfully");
        module.exports = {
            "db": db,
            "dbGet": dbGet,
            "dbSet": dbSet
        }
    });
*/

function shuffle(array) {
    let i, j, k;
    for (i = array.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        k = array[i];
        array[i] = array[j];
        array[j] = k;
    }
    return array;
}

function resetTimeLimit(serverGame) {
    clearTimeout(timeLimit);
    if (!serverGame.meta.timeLimit) return;
    timeLimit = setTimeout(() => {
        game.emit("timeLimit", serverGame);
        game.emit("updateUI", serverGame);
    }, serverGame.meta.timeLimit * 1000);
}

module.exports = {
    "emitter": game,
    "event": event,
    "shuffle": shuffle,
    "timeLimit": resetTimeLimit
}