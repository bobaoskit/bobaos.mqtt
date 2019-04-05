const Bobaos = require("bobaos.sub");
const Mqtt = require("mqtt");

let bobaos, mqtt;

mqtt = Mqtt.connect();

mqtt.on("connect", _ => {
  console.log("mqtt connected");
  bobaos = Bobaos();
  bobaos.once("ready", async _ => {
    console.log("bobaos connected");
    try {
      // get description for all datapoints 0-1000
      // even if datapoint was not configured in ETS,
      // this function returns descr anyway
      // to be fixed in future
      let descr = await bobaos.getDescription(null);
      // filter valid
      let valid = descr.filter(t => JSON.parse(t.valid));
      // and now transform to array of numbers
      let ids = valid.map(t => JSON.parse(t.id));
      console.log(ids);

      // create arrays of topics
      // first: topics for listening mqtt messages, so to be sent to KNX
      const topics2sub = ids.map(t => {
        return { id: t, topic: `bobaos/control/${t}` };
      });
      // second: publish on datapoint value change event
      const topics2pub = ids.map(t => {
        return { id: t, topic: `bobaos/state/${t}` };
      });

      // now register listeners
      const processMqttMessage = async (topic, message) => {
        console.log(`incoming mqtt message ${topic}:${message}`);
        const findByTopic = t => t.topic === topic;

        let topicFound = topics2sub.find(findByTopic);
        if (topicFound) {
          try {
            let id = topicFound.id;
            let value = JSON.parse(message);
            await bobaos.setValue({ id: id, value: value });
          } catch (e) {
            console.log("processMqttMessage: error processing message: ", e);
          }
        } else {
          console.log(`processMqttMessage: id for topic "${topic}" was not found`);
        }
      };
      mqtt.on("message", processMqttMessage);

      // subscribe to mqtt topics
      topics2sub.forEach(t => {
        mqtt.subscribe(t.topic, err => {
          if (err) {
            console.log(`error while subscribing to topic ${t.topic}:`, err);
          }
        });
      });

      const processBaosValue = payload => {
        if (Array.isArray(payload)) {
          return payload.forEach(processBaosValue);
        }

        const { id, value } = payload;
        const findById = t => t.id === id;
        let topicFound = topics2pub.find(findById);
        if (topicFound) {
          let topic = topicFound.topic;
          console.log(`publishing to topic: ${topic}, message: ${value}`);
          mqtt.publish(topic, JSON.stringify(value));
        } else {
          console.log(`processBaosValue: topic for id#${id} was not found`);
        }
      };
      bobaos.on("datapoint value", processBaosValue);
    } catch (e) {
      console.log("error while subscribing to configured datapoints: ", e);
    }
  });
});
