// server.js (MongoDB / Mongoose Version) - CORRECTED & IMPROVED

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const port = 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Database Connection ---
const dbURI = 'mongodb://localhost:27017/BloodBankDB';

mongoose.connect(dbURI)
    .then(() => console.log('✅ MongoDB connection successful.'))
    .catch(err => {
        console.error('❌ FATAL ERROR: MongoDB connection failed.', err);
        process.exit(1);
    });

// --- Mongoose Schemas ---
const bloodTypeSchema = new mongoose.Schema({ Blood_Type_ID: { type: String, required: true, unique: true }, Name: { type: String, required: true, unique: true } });
const hospitalSchema = new mongoose.Schema({ Hospital_ID: { type: String, required: true, unique: true }, Name: { type: String, required: true }, Address: String, Contact_Number: { type: String, required: true } });
const donorSchema = new mongoose.Schema({ Donor_ID: { type: String, required: true, unique: true }, Name: { type: String, required: true }, Contact_Number: String, Age: Number, Blood_Type_ID: String, Donor_Card_ID: { type: String, sparse: true } });
const recipientSchema = new mongoose.Schema({ Recipient_ID: { type: String, required: true, unique: true }, Name: { type: String, required: true }, Contact_Number: String, Blood_Type_ID: String, Donor_ID: String });
const donorTransactionSchema = new mongoose.Schema({ Donor_Trans_ID: { type: String, required: true, unique: true }, Donor_ID: String, Hospital_ID: String, Date: Date });
const recipientTransactionSchema = new mongoose.Schema({ Recipient_Trans_ID: { type: String, required: true, unique: true }, Recipient_ID: String, Hospital_ID: String, Blood_Type_ID: String, Date: Date });

// --- Mongoose Models ---
const BloodType = mongoose.model('BloodType', bloodTypeSchema);
const Hospital = mongoose.model('Hospital', hospitalSchema);
const Donor = mongoose.model('Donor', donorSchema);
const Recipient = mongoose.model('Recipient', recipientSchema);
const DonorTransaction = mongoose.model('DonorTransaction', donorTransactionSchema);
const RecipientTransaction = mongoose.model('RecipientTransaction', recipientTransactionSchema);

// --- API Route Builder ---
const createCrudRoutes = (model, modelName, idField) => {
    const endpoint = `/api/${modelName.toLowerCase()}s`;

    // GET ALL
    app.get(endpoint, async (req, res) => {
        try {
            const items = await model.find().sort({ [idField]: 1 });
            res.status(200).json(items);
        } catch (err) { res.status(500).json({ message: `Error fetching ${modelName}s: ${err.message}` }); }
    });

    // CREATE
    app.post(endpoint, async (req, res) => {
        try {
            // Check for empty required fields
            if (!req.body[idField]) {
                return res.status(400).json({ message: `${idField} is required.` });
            }
            const newItem = new model(req.body);
            await newItem.save();
            res.status(201).json({ message: `${modelName} created successfully.` });
        } catch (err) {
            if (err.code === 11000) {
                res.status(409).json({ message: `${modelName} with ID '${req.body[idField]}' already exists.` });
            } else {
                res.status(400).json({ message: `Error creating ${modelName}: ${err.message}` });
            }
        }
    });

    // UPDATE
    app.put(`${endpoint}/:id`, async (req, res) => {
        try {
            const query = { [idField]: req.params.id };
            const updatedItem = await model.findOneAndUpdate(query, req.body, { new: true });
            if (!updatedItem) return res.status(404).json({ message: `${modelName} not found.` });
            res.status(200).json({ message: `${modelName} updated successfully.` });
        } catch (err) { res.status(400).json({ message: `Error updating ${modelName}: ${err.message}` }); }
    });

    // DELETE
    app.delete(`${endpoint}/:id`, async (req, res) => {
        try {
            const query = { [idField]: req.params.id };
            const deletedItem = await model.findOneAndDelete(query);
            if (!deletedItem) return res.status(404).json({ message: `${modelName} not found.` });
            res.status(200).json({ message: `${modelName} deleted successfully.` });
        } catch (err) { res.status(500).json({ message: `Error deleting ${modelName}: ${err.message}` }); }
    });
};

// --- Create All Standard CRUD Routes ---
createCrudRoutes(BloodType, 'BloodType', 'Blood_Type_ID');
createCrudRoutes(Hospital, 'Hospital', 'Hospital_ID');
createCrudRoutes(Donor, 'Donor', 'Donor_ID');
createCrudRoutes(Recipient, 'Recipient', 'Recipient_ID');
createCrudRoutes(DonorTransaction, 'DonorTransaction', 'Donor_Trans_ID');
createCrudRoutes(RecipientTransaction, 'RecipientTransaction', 'Recipient_Trans_ID');

// --- Special Inventory Route (Calculated on-the-fly) ---
app.get('/api/inventory', async (req, res) => {
    try {
        const allBloodTypes = await BloodType.find().lean();
        const donorTransactions = await DonorTransaction.find().lean();
        const recipientTransactions = await RecipientTransaction.find().lean();
        const donors = await Donor.find().lean();

        const donorMap = new Map(donors.map(d => [d.Donor_ID, d]));
        const inventoryMap = new Map();

        allBloodTypes.forEach(bt => {
            inventoryMap.set(bt.Blood_Type_ID, {
                Blood_Type_ID: bt.Blood_Type_ID,
                Name: bt.Name,
                Units_in_Stock: 0
            });
        });

        for (const trans of donorTransactions) {
            const donor = donorMap.get(trans.Donor_ID);
            if (donor && inventoryMap.has(donor.Blood_Type_ID)) {
                inventoryMap.get(donor.Blood_Type_ID).Units_in_Stock++;
            }
        }

        for (const trans of recipientTransactions) {
            if (inventoryMap.has(trans.Blood_Type_ID)) {
                inventoryMap.get(trans.Blood_Type_ID).Units_in_Stock--;
            }
        }

        const finalInventory = Array.from(inventoryMap.values()).map(item => {
            let status = 'Adequate';
            if (item.Units_in_Stock <= 0) status = 'Critical';
            else if (item.Units_in_Stock <= 10) status = 'Low';
            else if (item.Units_in_Stock >= 50) status = 'High';
            return { ...item, Status: status };
        });
        
        res.status(200).json(finalInventory);
    } catch (err) {
        res.status(500).json({ message: `Error fetching inventory: ${err.message}` });
    }
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`✅ API Server is running on http://localhost:${port}`);
});