const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

// ใส่ URL ของ Google Apps Script Web App ที่ได้จากการ Deploy ที่นี่
const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbxe6ixhD0tIux9YZhZZi9NYIe5OeADp5PGqSTIQpD-Cd3tde5rk4rdOaqVlMQN6zvUw/exec';

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'data.json');

function readLocalData() {
    if (!fs.existsSync(DATA_FILE)) {
        const defaultData = {
            inventory: [],
            logs: [],
            categories: ['PV Module', 'Inverter', 'Cables', 'BOS', 'Tools', 'Mounting', 'Grounding'],
            units: ['Panel', 'Pcs', 'Set', 'Roll', 'BOX', 'Meter']
        };
        try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 4), 'utf8');
        } catch (err) {
            console.error("เกิดข้อผิดพลาดในการเขียนไฟล์ฐานข้อมูลเริ่มแรก:", err);
        }
        return defaultData;
    }
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error("เกิดข้อผิดพลาดในการดึงอ่านไฟล์ data.json:", err);
        return { inventory: [], logs: [], categories: [], units: [] };
    }
}

// REST API เพื่อดึงข้อมูล (ดึงจาก Google Sheet ถ้ามี URL หากไม่มีจะดึงจาก local data.json)
app.get('/api/data', async (req, res) => {
    if (GOOGLE_SHEET_URL && !GOOGLE_SHEET_URL.includes('YOUR_SCRIPT_ID_HERE')) {
        try {
            const response = await fetch(GOOGLE_SHEET_URL);
            if (response.ok) {
                const sheetData = await response.json();
                // บันทึกสำรองลง local data.json
                fs.writeFileSync(DATA_FILE, JSON.stringify(sheetData, null, 4), 'utf8');
                return res.json(sheetData);
            }
        } catch (err) {
            console.error("ไม่สามารถดึงข้อมูลจาก Google Sheet ได้ กำลังใช้ข้อมูลสำรองในเครื่อง:", err.message);
        }
    }
    res.json(readLocalData());
});

// REST API เพื่อเขียนบันทึกข้อมูล (ส่งไปเขียนลง Google Sheet และบันทึก local data.json พร้อมกัน)
app.post('/api/data', async (req, res) => {
    const { inventory, logs, categories, units } = req.body;
    const data = { inventory, logs, categories, units };
    
    // บันทึกลง local data.json
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4), 'utf8');
    } catch (err) {
        console.error("เกิดข้อผิดพลาดรันไทม์บันทึกข้อมูลทับ data.json:", err);
    }

    // ส่งไปซิงก์บันทึกลง Google Sheet
    if (GOOGLE_SHEET_URL && !GOOGLE_SHEET_URL.includes('YOUR_SCRIPT_ID_HERE')) {
        try {
            await fetch(GOOGLE_SHEET_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch (err) {
            console.error("เกิดข้อผิดพลาดในการส่งข้อมูลไปบันทึกลง Google Sheet:", err.message);
        }
    }

    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`CNES Inventory v1.7.8 Server กำลังเปิดใช้งานหลังบ้านเป็นปกติ...`);
    console.log(`คุณสามารถเข้าใช้งานระบบได้ที่ลิงก์นี้ -> http://localhost:${PORT}`);
    console.log(`================================================================`);
});