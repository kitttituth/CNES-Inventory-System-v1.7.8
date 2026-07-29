const express = require('express');
const serverless = require('serverless-http');
const { getStore } = require('@netlify/blobs');
const fs = require('fs');
const path = require('path');

const app = express();

// รองรับข้อมูลขนาดใหญ่ เช่น ข้อมูลการแนบไฟล์ PDF หรือประวัติรายการจำนวนมาก
app.use(express.json({ limit: '15mb' }));

// อ้างอิงที่ตั้งไฟล์ฐานข้อมูลสำรองกรณีกรณีรันแบบ Local (Offline)
const DATA_FILE = path.join(process.cwd(), 'data.json');

// ชุดข้อมูลตั้งต้นเริ่มต้นของระบบ
const defaultData = {
    inventory: [
        {
            "id": 1784457084982,
            "itemCode": "PV -001",
            "name": "JINKO",
            "model": "JKM595-72HL4R-BDV",
            "category": "PV Module",
            "unit": "Panel",
            "qty": 30,
            "reserve_out": 0,
            "reserve_in": 0
        },
        {
            "id": 1784457105196,
            "itemCode": "PV -002",
            "name": "JINKO",
            "model": "JKM635-78HL4-BDV",
            "category": "PV Module",
            "unit": "Panel",
            "qty": 10000,
            "reserve_out": 0,
            "reserve_in": 0
        }
    ],
    logs: [],
    categories: [
        "PV Module",
        "Inverter",
        "Cables",
        "BOS",
        "Tools",
        "Mounting",
        "Grounding"
    ],
    units: [
        "Panel",
        "Pcs",
        "Set",
        "Roll",
        "BOX",
        "Meter"
    ]
};

// ฟังก์ชันสำหรับอ่านข้อมูล (ดึงจาก Netlify Blobs เสมอ หากออฟไลน์จะสลับไปเปิด data.json ในเครื่อง)
async function readData() {
    try {
        const store = getStore({ name: "cnes_inventory", consistency: "strong" });
        const dataStr = await store.get("data.json");
        if (dataStr) {
            return JSON.parse(dataStr);
        } else {
            await store.set("data.json", JSON.stringify(defaultData));
            return defaultData;
        }
    } catch (err) {
        console.warn("ระบบคลาวด์ปิดอยู่หรือไม่ได้เปิดใช้ Netlify Dev: สลับไปใช้ข้อมูลภายในเครื่องคอมพิวเตอร์ปัจจุบัน");
    }

    if (!fs.existsSync(DATA_FILE)) {
        try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 4), 'utf8');
        } catch (err) {
            console.error("ไม่สามารถเขียนไฟล์เริ่มต้นในเครื่องได้:", err);
        }
        return defaultData;
    }
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error("ไม่สามารถดึงข้อมูลจากไฟล์ data.json บนระบบภายในได้:", err);
        return defaultData;
    }
}

// ฟังก์ชันสำหรับเขียนและบันทึกข้อมูลลงฐานข้อมูลเรียลไทม์
async function writeData(data) {
    try {
        const store = getStore({ name: "cnes_inventory", consistency: "strong" });
        await store.set("data.json", JSON.stringify(data));
        return true;
    } catch (err) {
        console.warn("ไม่สามารถอัปเดตลงคลาวด์ได้ชั่วคราว: กำลังบันทึกลงไฟล์สำรอง data.json ภายในเครื่อง");
    }

    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4), 'utf8');
        return true;
    } catch (err) {
        console.error("ล้มเหลวในการบันทึกลงไฟล์สำรอง:", err);
        throw err;
    }
}

// ผูก Endpoint สำหรับรองรับทั้งเส้นทางตรงและเส้นทางผ่าน Netlify Redirect
app.get(['/api/data', '/data'], async (req, res) => {
    try {
        const data = await readData();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "ไม่สามารถอ่านข้อมูลสต๊อกได้" });
    }
});

app.post(['/api/data', '/data'], async (req, res) => {
    try {
        const { inventory, logs, categories, units } = req.body;
        const data = { inventory, logs, categories, units };
        await writeData(data);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "ไม่สามารถบันทึกข้อมูลสต๊อกได้" });
    }
});

module.exports.handler = serverless(app);