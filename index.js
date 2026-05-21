const { Client, LocalAuth } = require("whatsapp-web.js");
const TelegramBot = require("node-telegram-bot-api");
const qrcode = require("qrcode-terminal");
const cron = require("node-cron");
const mongoose = require("mongoose");

// =====================================
// CONFIG
// =====================================

const TELEGRAM_TOKEN = "8904941356:AAGq0SaVjETFYOy2gz6r6Z1CMBTMw_kAmZc";

const MONGODB_URI =
    "mongodb://makannasi:makannasisampaikenyang@ac-7s9lkuj-shard-00-00.ro4fwp8.mongodb.net:27017,ac-7s9lkuj-shard-00-01.ro4fwp8.mongodb.net:27017,ac-7s9lkuj-shard-00-02.ro4fwp8.mongodb.net:27017/?ssl=true&replicaSet=atlas-4wmzvo-shard-0&authSource=admin&appName=botTelegramWA";

// =====================================
// SCHEMA
// =====================================

const scheduleSchema = new mongoose.Schema({
    number: String,
    messages: [String],
    time: String,
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const Schedule = mongoose.model("Schedule", scheduleSchema);

// =====================================
// TELEGRAM BOT
// =====================================

const bot = new TelegramBot(TELEGRAM_TOKEN, {
    polling: true,
});

// =====================================
// WHATSAPP CLIENT
// =====================================

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-zygote",
            "--single-process",
        ],
    },
});
// =====================================
// TEMP DATA - JADWAL
// =====================================

let targetNumber = "";
let draftMessages = [];
let scheduledTime = "";

// =====================================
// TEMP DATA - KIRIM LANGSUNG
// =====================================

let instantNumber = "";
let instantMessages = [];

// =====================================
// WHATSAPP EVENTS
// =====================================

client.on("qr", (qr) => {
    console.log("SCAN QR WHATSAPP");
    qrcode.generate(qr, { small: true });
});

client.on("ready", async () => {
    console.log("WhatsApp Ready");
    await loadSchedules();
});

client.on("auth_failure", (msg) => {
    console.log("AUTH FAILURE", msg);
});

client.on("disconnected", (reason) => {
    console.log("DISCONNECTED", reason);
});

// =====================================
// START COMMAND
// =====================================

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
        msg.chat.id,
        `Bot aktif

📅 JADWAL OTOMATIS:
/nomor 628xxxx
/tulis isi pesan
/list
/clear
/jam 21:30
/jadwalkan
/data
/hapus ID

📨 KIRIM LANGSUNG:
/snomor 628xxxx
/stulis isi pesan
/slist
/sclear
/kirim`,
    );
});

// =====================================
// SET NOMOR (JADWAL)
// =====================================

bot.onText(/\/nomor (.+)/, (msg, match) => {
    targetNumber = match[1].replace(/\D/g, "");
    bot.sendMessage(msg.chat.id, `Nomor disimpan:\n${targetNumber}`);
});

// =====================================
// TAMBAH PESAN (JADWAL)
// =====================================

bot.onText(/\/tulis (.+)/, (msg, match) => {
    const text = match[1];
    draftMessages.push(text);
    bot.sendMessage(msg.chat.id, "Pesan ditambahkan");
});

// =====================================
// LIST DRAFT (JADWAL)
// =====================================

bot.onText(/\/list/, (msg) => {
    if (draftMessages.length === 0) {
        return bot.sendMessage(msg.chat.id, "Draft kosong");
    }

    let result = "DRAFT:\n\n";
    draftMessages.forEach((item, index) => {
        result += `${index + 1}. ${item}\n`;
    });

    bot.sendMessage(msg.chat.id, result);
});

// =====================================
// CLEAR DRAFT (JADWAL)
// =====================================

bot.onText(/\/clear/, (msg) => {
    draftMessages = [];
    bot.sendMessage(msg.chat.id, "Draft dibersihkan");
});

// =====================================
// SET JAM (JADWAL)
// =====================================

bot.onText(/\/jam (.+)/, (msg, match) => {
    scheduledTime = match[1];
    bot.sendMessage(msg.chat.id, `Jadwal:\n${scheduledTime}`);
});

// =====================================
// JADWALKAN
// =====================================

bot.onText(/\/jadwalkan/, async (msg) => {
    if (!targetNumber) {
        return bot.sendMessage(msg.chat.id, "Nomor belum diatur");
    }

    if (draftMessages.length === 0) {
        return bot.sendMessage(msg.chat.id, "Draft kosong");
    }

    if (!scheduledTime) {
        return bot.sendMessage(msg.chat.id, "Jam belum diatur");
    }

    try {
        const newSchedule = new Schedule({
            number: targetNumber,
            messages: draftMessages,
            time: scheduledTime,
        });

        await newSchedule.save();

        registerSchedule(newSchedule);

        bot.sendMessage(
            msg.chat.id,
            `Jadwal berhasil dibuat\n\nID:\n${newSchedule._id}`,
        );

        draftMessages = [];
        scheduledTime = "";
    } catch (err) {
        console.log(err);
        bot.sendMessage(msg.chat.id, "Gagal membuat jadwal");
    }
});

// =====================================
// LIHAT DATA (JADWAL)
// =====================================

bot.onText(/\/data/, async (msg) => {
    try {
        const schedules = await Schedule.find();

        if (schedules.length === 0) {
            return bot.sendMessage(msg.chat.id, "Tidak ada jadwal");
        }

        let result = "";
        schedules.forEach((item) => {
            result += `ID: ${item._id}\nNomor: ${item.number}\nJam: ${item.time}\n\n`;
        });

        bot.sendMessage(msg.chat.id, result);
    } catch (err) {
        console.log(err);
        bot.sendMessage(msg.chat.id, "Gagal mengambil data");
    }
});

// =====================================
// HAPUS JADWAL
// =====================================

bot.onText(/\/hapus (.+)/, async (msg, match) => {
    try {
        await Schedule.findByIdAndDelete(match[1]);
        bot.sendMessage(msg.chat.id, "Jadwal dihapus");
    } catch (err) {
        console.log(err);
        bot.sendMessage(msg.chat.id, "Gagal hapus");
    }
});

// =====================================
// SET NOMOR (KIRIM LANGSUNG)
// =====================================

bot.onText(/\/snomor (.+)/, (msg, match) => {
    instantNumber = match[1].replace(/\D/g, "");
    bot.sendMessage(
        msg.chat.id,
        `Nomor kirim langsung disimpan:\n${instantNumber}`,
    );
});

// =====================================
// TAMBAH PESAN (KIRIM LANGSUNG)
// =====================================

bot.onText(/\/stulis (.+)/, (msg, match) => {
    const text = match[1];
    instantMessages.push(text);
    bot.sendMessage(msg.chat.id, `Pesan ditambahkan ke list kirim:\n${text}`);
});

// =====================================
// LIST PESAN (KIRIM LANGSUNG)
// =====================================

bot.onText(/\/slist/, (msg) => {
    if (instantMessages.length === 0) {
        return bot.sendMessage(msg.chat.id, "List kirim kosong");
    }

    let result = "LIST KIRIM LANGSUNG:\n\n";
    instantMessages.forEach((item, index) => {
        result += `${index + 1}. ${item}\n`;
    });

    bot.sendMessage(msg.chat.id, result);
});

// =====================================
// CLEAR PESAN (KIRIM LANGSUNG)
// =====================================

bot.onText(/\/sclear/, (msg) => {
    instantMessages = [];
    bot.sendMessage(msg.chat.id, "List kirim dibersihkan");
});

// =====================================
// KIRIM LANGSUNG
// =====================================

bot.onText(/\/kirim/, async (msg) => {
    if (!instantNumber) {
        return bot.sendMessage(
            msg.chat.id,
            "Nomor belum diatur\nGunakan /snomor 628xxxx",
        );
    }

    if (instantMessages.length === 0) {
        return bot.sendMessage(
            msg.chat.id,
            "List pesan kosong\nGunakan /stulis isi pesan",
        );
    }

    try {
        const number = instantNumber + "@c.us";

        const isRegistered = await client.isRegisteredUser(number);

        if (!isRegistered) {
            return bot.sendMessage(
                msg.chat.id,
                "Nomor tidak terdaftar di WhatsApp",
            );
        }

        bot.sendMessage(
            msg.chat.id,
            `Mengirim ${instantMessages.length} pesan ke ${instantNumber}...`,
        );

        for (const text of instantMessages) {
            await client.sendMessage(number, text);
            await delay(3000);
        }

        bot.sendMessage(msg.chat.id, "✅ Semua pesan berhasil dikirim");

        instantMessages = [];
        instantNumber = "";
    } catch (err) {
        console.log(err);
        bot.sendMessage(msg.chat.id, "❌ Gagal mengirim pesan");
    }
});

// =====================================
// REGISTER SCHEDULE
// =====================================
function registerSchedule(data) {
    const split = data.time.split(":");
    const hour = split[0];
    const minute = split[1];

    cron.schedule(`${minute} ${hour} * * *`, async () => {
        try {
            const number = data.number + "@c.us";

            const isRegistered = await client.isRegisteredUser(number);

            if (!isRegistered) {
                console.log("Nomor tidak terdaftar");
                return;
            }

            for (const text of data.messages) {
                await client.sendMessage(number, text);
                await delay(3000);
            }

            console.log("Pesan berhasil dikirim");
        } catch (err) {
            console.log(err);
        }

    }, {
        timezone: "Asia/Jakarta"  // <-- tambah ini
    });
}
// =====================================
// LOAD DATABASE SCHEDULE
// =====================================

async function loadSchedules() {
    try {
        const schedules = await Schedule.find();

        schedules.forEach((item) => {
            registerSchedule(item);
        });

        console.log(`${schedules.length} schedule loaded`);
    } catch (err) {
        console.log("Gagal load schedules:", err);
    }
}

// =====================================
// DELAY
// =====================================

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// =====================================
// MAIN - MongoDB dulu, baru WhatsApp
// =====================================

async function startApp() {
    try {
        console.log("Connecting to MongoDB...");

        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
        });

        console.log("MongoDB Connected");

        mongoose.connection.on("disconnected", () => {
            console.log("⚠️ MongoDB disconnected");
        });

        mongoose.connection.on("error", (err) => {
            console.error("❌ MongoDB error:", err);
        });

        client.initialize();
    } catch (err) {
        console.error("❌ Gagal koneksi MongoDB:", err);
        process.exit(1);
    }
}

startApp();
