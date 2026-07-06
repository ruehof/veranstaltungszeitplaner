import { MongoClient } from "mongodb";

// MongoDB-Store: Collections "schedules" und "cards".
// Der Datenbankname kommt aus der Verbindungs-URI (z.B. .../veranstaltungszeitplaner).
export async function createMongoStorage(uri) {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const schedules = db.collection("schedules");
  const cards = db.collection("cards");

  // Indizes laut SPEC: shareId (Freigabelink) und scheduleId (Karten je Plan)
  await schedules.createIndex({ id: 1 }, { unique: true });
  await schedules.createIndex({ shareId: 1 }, { unique: true });
  await cards.createIndex({ id: 1 }, { unique: true });
  await cards.createIndex({ scheduleId: 1 });

  // Mongo-interne _id nie nach außen geben
  const noMongoId = { projection: { _id: 0 } };

  return {
    kind: "mongodb",

    async createSchedule(schedule) {
      await schedules.insertOne({ ...schedule });
      return schedule;
    },

    async getScheduleById(id) {
      return schedules.findOne({ id }, noMongoId);
    },

    async getScheduleByShareId(shareId) {
      return schedules.findOne({ shareId }, noMongoId);
    },

    async updateSchedule(id, updates) {
      return schedules.findOneAndUpdate(
        { id },
        { $set: updates },
        { returnDocument: "after", projection: { _id: 0 } }
      );
    },

    async deleteSchedule(id) {
      await cards.deleteMany({ scheduleId: id });
      await schedules.deleteOne({ id });
    },

    async createCard(card) {
      await cards.insertOne({ ...card });
      return card;
    },

    async getCards(scheduleId) {
      return cards.find({ scheduleId }, noMongoId).sort({ createdAt: 1 }).toArray();
    },

    async getCard(scheduleId, cardId) {
      return cards.findOne({ scheduleId, id: cardId }, noMongoId);
    },

    async updateCard(scheduleId, cardId, updates) {
      return cards.findOneAndUpdate(
        { scheduleId, id: cardId },
        { $set: updates },
        { returnDocument: "after", projection: { _id: 0 } }
      );
    },

    async deleteCard(scheduleId, cardId) {
      await cards.deleteOne({ scheduleId, id: cardId });
    },

    async close() {
      await client.close();
    },
  };
}
