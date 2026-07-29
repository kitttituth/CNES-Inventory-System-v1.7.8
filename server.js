const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json());

// บริการและรันไฟล์หน้าบ้าน (index.html, script.js, style.css) จากที่ตั้งปัจจุบัน
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'data.json');

// ตรวจสอบและดึงข้อมูลจากไฟล์ data.json กรณีไม่พบไฟล์จะสร้างตัวตั้งต้นมาตรฐานให้อัตโนมัติทันที
function readData() {
    if (!fs.existsSync(DATA_FILE)) {
        // ชุดข้อมูลเริ่มต้นเขียนทับลงเซิร์ฟเวอร์เพื่อซิงก์ข้อมูลไปใช้ร่วมกันได้ทุกเครื่อง
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

// REST API เพื่อให้เบราว์เซอร์ฝั่งอื่นดึงค่าหลักไปใช้ซิงก์กัน
app.get('/api/data', (req, res) => {
    res.json(readData());
});

// REST API เพื่อเขียนข้อมูลทับกลับมาที่เซิร์ฟเวอร์และบันทึกข้อมูลหลักร่วมกัน
app.post('/api/data', (req, res) => {
    const { inventory, logs, categories, units } = req.body;
    const data = { inventory, logs, categories, units };
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 4), 'utf8');
        res.json({ success: true });
    } catch (err) {
        console.error("เกิดข้อผิดพลาดรันไทม์บันทึกข้อมูลทับ data.json:", err);
        res.status(500).json({ error: "ล้มเหลวในการเขียนบันทึกไฟล์ออโต้บนฮาร์ดดิสก์เซิร์ฟเวอร์" });
    }
});

app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`CNES Inventory v1.7.8 Server กำลังเปิดใช้งานหลังบ้านเป็นปกติ...`);
    console.log(`คุณสามารถเข้าใช้งานระบบได้ที่ลิงก์นี้ -> http://localhost:${PORT}`);
    console.log(`================================================================`);
});