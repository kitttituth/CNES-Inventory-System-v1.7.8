function cnesApp() {
    return {
        // --- ระบบสิทธิ์และหน้าจอ ---
        isLoggedIn: false,
        userRole: '',
        loginPin: '',
        page: 'dashboard',
        
        // --- ฐานข้อมูลหลัก ---
        categories: [],
        units: [],
        inventory: [],
        logs: [],
        
        // --- ข้อมูลฟอร์มและการตั้งค่า ---
        form: { user: '', site: '', txnType: 'ACTUAL', items: [] },
        newCat: '',
        newUnit: '',
        newItem: { itemCode: '', name: '', model: '', category: '', unit: '', qty: 0 },
        printData: null,

        // [1] โหลดข้อมูลเริ่มต้น (อัปเกรดคีย์เป็น v1.7.3)
        async initData() {
            // โหลดข้อมูลด่านแรกจาก LocalStorage (ในเบราว์เซอร์) เผื่อกรณีเซิร์ฟเวอร์จำลองออฟไลน์
            this.inventory = JSON.parse(localStorage.getItem('cnes_v173_inv')) || [];
            this.logs = JSON.parse(localStorage.getItem('cnes_v173_logs')) || [];
            this.categories = JSON.parse(localStorage.getItem('cnes_v173_cats')) || [];
            this.units = JSON.parse(localStorage.getItem('cnes_v173_units')) || [];

            // พยายามโหลดดึงข้อมูลเวอร์ชันล่าสุดจากไฟล์ data.json บนฮาร์ดดิสก์ผ่านระบบหลังบ้าน
            try {
                const res = await fetch('/api/data');
                if (res.ok) {
                    const serverData = await res.json();
                    if (serverData) {
                        this.inventory = serverData.inventory || [];
                        this.logs = serverData.logs || [];
                        this.categories = serverData.categories || [];
                        this.units = serverData.units || [];
                    }
                }
            } catch (err) {
                console.log("หลังบ้านออฟไลน์ ดึงข้อมูลประวัติและสต๊อกจาก LocalStorage แทน");
            }

            // โหลดหมวดหมู่และหน่วยนับพร้อมระบบสำรองกรณีลบออกจนไม่มีค่า (Dropdown Backup)
            if (!this.categories || this.categories.length === 0) {
                this.categories = ['PV Module', 'Inverter', 'Cables', 'BOS', 'Tools', 'Mounting', 'Grounding'];
            }
            if (!this.units || this.units.length === 0) {
                this.units = ['Panel','Pcs', 'Set', 'Roll', 'BOX', 'Meter'];
            }
            
            this.resetForm();
            
            const savedRole = localStorage.getItem('cnes_v173_role');
            if(savedRole) { this.isLoggedIn = true; this.userRole = savedRole; }
        },

        // [2] ระบบ Login
        handleLogin() {
            if (this.loginPin === 'admincnes111111') { this.userRole = 'admin'; }
            else if (this.loginPin === '111111') { this.userRole = 'user'; }
            else { alert('PIN ไม่ถูกต้อง!'); return; }
            this.isLoggedIn = true;
            localStorage.setItem('cnes_v173_role', this.userRole);
            this.loginPin = '';
        },

        logout() {
            this.isLoggedIn = false;
            localStorage.removeItem('cnes_v173_role');
        },

        // จัดเรียงรหัส Item Code จากน้อยไปมาก แยกตามหมวดหมู่ (หน้า Dashboard)
        getInventoryByCategory(cat) {
            return this.inventory
                .filter(i => i.category === cat)
                .sort((a, b) => a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true, sensitivity: 'base' }));
        },

        // ดึงรายการวัสดุเรียงลำดับจากน้อยไปมากสำหรับแสดงใน Settings
        getSortedInventory() {
            return this.inventory.slice().sort((a, b) => a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true, sensitivity: 'base' }));
        },

        getPendingCount() {
            return this.logs.filter(l => l.status === 'PENDING').length;
        },

        // [3] จัดการฟอร์มเบิก/รับ (Multi-item)
        resetForm() {
            this.form = { user: '', site: '', txnType: 'ACTUAL', items: [{ itemId: '', itemCode: '', name: '', model: '', qty: 0, unit: '' }] };
        },

        addRow() {
            this.form.items.push({ itemId: '', itemCode: '', name: '', model: '', qty: 0, unit: '' });
        },

        removeRow(idx) {
            if(this.form.items.length > 1) this.form.items.splice(idx, 1);
        },

        autoFillFromMaster(row) {
            const master = this.inventory.find(i => i.id == row.itemId);
            if(master) {
                row.itemCode = master.itemCode;
                row.name = master.name;
                row.model = master.model;
                row.unit = master.unit;
            }
        },

        // [4] การบันทึกรายการ
        submitTransaction() {
            if(!this.form.user || this.form.items.some(i => !i.itemId || i.qty <= 0)) {
                alert('กรุณากรอกชื่อผู้เบิกและเลือกรหัสวัสดุให้ครบถ้วน!'); return;
            }

            this.logs.unshift({
                id: Date.now(),
                timestamp: new Date().toLocaleString('th-TH'),
                type: this.page.toUpperCase(),
                txnType: this.form.txnType,
                status: 'PENDING',
                user: this.form.user,
                site: this.form.site,
                items: JSON.parse(JSON.stringify(this.form.items)),
                pdfData: null,
                pdfName: ''
            });

            this.saveData();
            alert('บันทึกสำเร็จ! กรุณารอ Admin อนุมัติในหน้า Logs');
            this.page = 'logs';
        },

        // [5] ระบบอนุมัติ (Admin Only)
        approveLog(logId) {
            const log = this.logs.find(l => l.id === logId);
            if(!log) return;

            if (log.type === 'OUT' && log.txnType === 'ACTUAL') {
                for (let row of log.items) {
                    const inv = this.inventory.find(i => i.id == row.itemId);
                    if (inv && inv.qty < row.qty) {
                        alert(`ไม่สามารถอนุมัติได้: วัสดุ ${row.itemCode} ในสต๊อกไม่พอ!`); 
                        return;
                    }
                }
            }

            log.items.forEach(row => {
                const inv = this.inventory.find(i => i.id == row.itemId);
                if (inv) {
                    const q = parseInt(row.qty);
                    if (log.type === 'OUT') {
                        if (log.txnType === 'ACTUAL') inv.qty -= q;
                        else inv.reserve_out = (inv.reserve_out || 0) + q;
                    } else {
                        if (log.txnType === 'ACTUAL') inv.qty += q;
                        else inv.reserve_in = (inv.reserve_in || 0) + q;
                    }
                }
            });

            log.status = 'APPROVED';
            this.saveData();
            alert('อนุมัติและปรับปรุงสต๊อกเรียบร้อยแล้ว');
        },

        // [6] การจัดการไฟล์ PDF
        uploadPDF(event, logId) {
            const file = event.target.files[0];
            if (!file || file.type !== 'application/pdf') return alert('กรุณาเลือกไฟล์ PDF เท่านั้น');
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const log = this.logs.find(l => l.id === logId);
                if (log) {
                    log.pdfData = e.target.result;
                    log.pdfName = file.name;
                    this.saveData();
                }
            };
            reader.readAsDataURL(file);
        },

        removePDF(logId) {
            if(confirm('ลบไฟล์ PDF หรือไม่?')) {
                const log = this.logs.find(l => l.id === logId);
                if(log) { log.pdfData = null; log.pdfName = ''; this.saveData(); }
            }
        },

        printLogData(log) {
            this.printData = log;
            document.body.classList.add('printing-log');
            setTimeout(() => {
                window.print();
                document.body.classList.remove('printing-log');
                this.printData = null;
            }, 500);
        },

        // [7] Settings & Master Data
        generateItemCode() {
            if(!this.newItem.category) return;
            const prefix = this.newItem.category.substring(0, 3).toUpperCase();
            const count = this.inventory.filter(i => i.category === this.newItem.category).length + 1;
            this.newItem.itemCode = `${prefix}-${String(count).padStart(3, '0')}`;
        },

        addMaterial() {
            if(!this.newItem.name || !this.newItem.itemCode) return alert('กรุณาระบุรหัสและชื่อวัสดุ!');
            this.inventory.push({
                id: Date.now(),
                itemCode: this.newItem.itemCode.toUpperCase(),
                name: this.newItem.name.toUpperCase(),
                model: this.newItem.model.toUpperCase() || 'N/A',
                category: this.newItem.category,
                unit: this.newItem.unit || this.units[0],
                qty: parseInt(this.newItem.qty) || 0,
                reserve_out: 0,
                reserve_in: 0
            });
            this.newItem = { itemCode: '', name: '', model: '', category: '', unit: this.units[0], qty: 0 };
            this.saveData();
        },

        // เปลี่ยนระบบลบวัสดุหลักเป็นลบอ้างอิงด้วย ID (ป้องกันดัชนีคลาดเคลื่อนขณะเรียงลำดับ)
        deleteMaterial(id) {
            if(confirm('ลบข้อมูลถาวร?')) { 
                this.inventory = this.inventory.filter(item => item.id !== id); 
                this.saveData(); 
            }
        },

        // ฟังก์ชันระบบ Category
        addCategory() {
            if (!this.newCat.trim()) return alert('กรุณากรอกชื่อหมวดหมู่!');
            if (this.categories.includes(this.newCat.trim())) return alert('มีหมวดหมู่นี้อยู่แล้ว!');
            this.categories.push(this.newCat.trim());
            this.newCat = '';
            this.saveData();
        },

        removeCategory(idx) {
            if (confirm('ลบหมวดหมู่นี้หรือไม่?')) {
                this.categories.splice(idx, 1);
                this.saveData();
            }
        },

        // ฟังก์ชันระบบ Unit
        addUnit() {
            if (!this.newUnit.trim()) return alert('กรุณากรอกหน่วยนับ!');
            const unitUpper = this.newUnit.trim().toUpperCase();
            if (this.units.includes(unitUpper)) return alert('มีหน่วยนับนี้อยู่แล้ว!');
            this.units.push(unitUpper);
            this.newUnit = '';
            this.saveData();
        },

        removeUnit(idx) {
            if (confirm('ลบหน่วยนับนี้หรือไม่?')) {
                this.units.splice(idx, 1);
                this.saveData();
            }
        },

        // กู้คืนหมวดหมู่และหน่วยนับกลับเป็นมาตรฐานจากโค้ด (Dropdowm Backup)
        resetDropdownDefaults() {
            if (confirm('ต้องการล้างข้อมูลและกู้คืนตัวเลือก Dropdown หมวดหมู่และหน่วยนับสำรองจากระบบโค้ดเริ่มต้นหรือไม่?')) {
                this.categories = ['PV Module', 'Inverter', 'Cables', 'BOS', 'Tools', 'Mounting', 'Grounding'];
                this.units = ['Panel','Pcs', 'Set', 'Roll', 'BOX', 'Meter'];
                this.saveData();
                alert('คืนค่าเริ่มต้น Dropdown สำรองเรียบร้อยแล้ว');
            }
        },

        // ส่งออก CSV ข้อมูลคงคลัง
        downloadCSV() {
            if (this.inventory.length === 0) return alert('ไม่มีข้อมูลสำหรับส่งออก!');
            let csv = '\uFEFF'; 
            csv += 'Code (รหัส),Material (ชื่อวัสดุ),Model (รุ่น),Category (หมวดหมู่),Balance (คงเหลือ),Reserve (จอง),Unit (หน่วย)\n';
            this.inventory.forEach(item => {
                csv += `"${item.itemCode}","${item.name}","${item.model}","${item.category}",${item.qty},${item.reserve_out || 0},"${item.unit}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', `CNES_Stock_Report.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        saveData() {
            // 1. บันทึกลง LocalStorage (ในเบราว์เซอร์) ตามปกติเพื่อความเสถียรสองชั้น
            localStorage.setItem('cnes_v173_inv', JSON.stringify(this.inventory));
            localStorage.setItem('cnes_v173_logs', JSON.stringify(this.logs));
            localStorage.setItem('cnes_v173_cats', JSON.stringify(this.categories));
            localStorage.setItem('cnes_v173_units', JSON.stringify(this.units));

            // 2. ส่งข้อมูลไปอัปเดตเซฟทับเป็นไฟล์ data.json บนเครื่องจริงผ่านระบบหลังบ้านโดยอัตโนมัติ
            const payload = {
                inventory: this.inventory,
                logs: this.logs,
                categories: this.categories,
                units: this.units
            };
            fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(err => {
                console.log("หลังบ้านยังไม่ถูกรัน บันทึกข้อมูลสำรองเฉพาะในเบราว์เซอร์");
            });
        },

        t(en, th) { return `${en} (${th})`; }
    }
}