function cnesApp() {
    return {
        // --- ระบบสิทธิ์และหน้าจอ ---
        isLoggedIn: false,
        userRole: '',
        loginPin: '',
        page: 'dashboard',
        sidebarOpen: false,
        userModalOpen: false,
        
        // --- ฐานข้อมูลหลัก ---
        categories: [],
        units: [],
        inventory: [],
        logs: [],
        
        // --- ข้อมูลฟอร์มและการตั้งค่า ---
        form: { user: '', site: '', txnType: 'ACTUAL', items: [] },
        newCat: '',
        newUnit: '',
        newItem: { itemCode: '', name: '', model: '', location: '', category: '', unit: '', qty: 0 },
        printData: null,

        // [1] โหลดข้อมูลเริ่มต้น (อัปเกรดฐานข้อมูลสู่คีย์เซฟตี้ v1.7.8 ป้องกันจอขาว)
        async initData() {
            try { this.inventory = JSON.parse(localStorage.getItem('cnes_v178_inv')) || []; } catch(e) { this.inventory = []; }
            try { this.logs = JSON.parse(localStorage.getItem('cnes_v178_logs')) || []; } catch(e) { this.logs = []; }
            try { this.categories = JSON.parse(localStorage.getItem('cnes_v178_cats')) || []; } catch(e) { this.categories = []; }
            try { this.units = JSON.parse(localStorage.getItem('cnes_v178_units')) || []; } catch(e) { this.units = []; }

            // ดึงข้อมูลหลักจากเซิร์ฟเวอร์ / Google Sheet
            await this.fetchServerData();

            // ตั้งเวลารันซิงก์ข้อมูลกับเซิร์ฟเวอร์หลักอัตโนมัติทุกๆ 5 วินาที เพื่อให้อุปกรณ์ทุกเครื่อง (Mobile/PC) แสดงยอดตรงกันตลอดเวลา
            setInterval(() => {
                this.fetchServerData();
            }, 5000);

            if (!this.categories || this.categories.length === 0) {
                this.categories = ['PV Module', 'Inverter', 'Cables', 'BOS', 'Tools', 'Mounting', 'Grounding'];
            }
            if (!this.units || this.units.length === 0) {
                this.units = ['Panel','Pcs', 'Set', 'Roll', 'BOX', 'Meter'];
            }
            
            this.checkExpiredReservations();
            this.resetForm();
            
            const savedRole = sessionStorage.getItem('cnes_v178_role');
            if(savedRole) { 
                this.isLoggedIn = true; 
                this.userRole = savedRole; 
                if (this.userRole !== 'admin' && this.page === 'settings') {
                    this.page = 'dashboard';
                }
            }
        },

        // ดึงข้อมูลล่าสุดจากหลังบ้าน/Google Sheet มาปรับปรุงคลังในเครื่อง
        async fetchServerData() {
            try {
                const res = await fetch('/api/data');
                if (res.ok) {
                    const serverData = await res.json();
                    if (serverData) {
                        this.inventory = serverData.inventory || [];
                        this.logs = serverData.logs || [];
                        this.categories = serverData.categories || [];
                        this.units = serverData.units || [];
                        
                        localStorage.setItem('cnes_v178_inv', JSON.stringify(this.inventory));
                        localStorage.setItem('cnes_v178_logs', JSON.stringify(this.logs));
                        localStorage.setItem('cnes_v178_cats', JSON.stringify(this.categories));
                        localStorage.setItem('cnes_v178_units', JSON.stringify(this.units));
                    }
                }
            } catch (err) {
                console.log("เซิร์ฟเวอร์หลังบ้านออฟไลน์ รันระบบด้วยฐานข้อมูลเบราว์เซอร์ภายในชั่วคราว");
            }
        },

        // [2] ระบบตรวจสอบ Login
        handleLogin() {
            if (this.loginPin === 'admincnes111111') { this.userRole = 'admin'; }
            else if (this.loginPin === '111111') { this.userRole = 'user'; }
            else { alert('PIN ไม่ถูกต้อง!'); return; }
            this.isLoggedIn = true;

            if (this.userRole !== 'admin' && this.page === 'settings') {
                this.page = 'dashboard';
            }

            sessionStorage.setItem('cnes_v178_role', this.userRole);
            this.loginPin = '';
        },

        logout() {
            this.isLoggedIn = false;
            this.userRole = '';
            sessionStorage.removeItem('cnes_v178_role');
        },

        getInventoryByCategory(cat) {
            return this.inventory
                .filter(i => i.category === cat)
                .sort((a, b) => a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true, sensitivity: 'base' }));
        },

        getSortedInventory() {
            return this.inventory.slice().sort((a, b) => a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true, sensitivity: 'base' }));
        },

        getPendingCount() {
            return this.logs.filter(l => l.status === 'PENDING').length;
        },

        // [3] ระบบจัดการตารางแบบฟอร์มเบิกจ่ายแบบพหุรายการ
        resetForm() {
            this.form = { user: '', site: '', txnType: 'ACTUAL', items: [{ itemId: '', itemCode: '', name: '', model: '', qty: 0, unit: this.units[0] || 'Panel' }] };
        },

        addRow() {
            this.form.items.push({ itemId: '', itemCode: '', name: '', model: '', qty: 0, unit: this.units[0] || 'Panel' });
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

        smartAutoFill(row, queryText) {
            if (!queryText || !queryText.trim()) {
                row.itemId = '';
                return;
            }
            const q = queryText.trim().toUpperCase();

            let master = this.inventory.find(i => 
                (i.itemCode && i.itemCode.toUpperCase() === q) ||
                (i.name && i.name.toUpperCase() === q) ||
                (i.model && i.model.toUpperCase() === q)
            );

            if (!master && q.length >= 2) {
                master = this.inventory.find(i => 
                    (i.itemCode && i.itemCode.toUpperCase().includes(q)) ||
                    (i.name && i.name.toUpperCase().includes(q)) ||
                    (i.model && i.model.toUpperCase().includes(q))
                );
            }

            if (master) {
                row.itemId = master.id;
                row.itemCode = master.itemCode;
                row.name = master.name;
                row.model = master.model;
                row.unit = master.unit;
            } else {
                row.itemId = '';
            }
        },

        autoFillFromCodeText(row) {
            this.smartAutoFill(row, row.itemCode);
        },

        autoFillFromNameText(row) {
            this.smartAutoFill(row, row.name);
        },

        autoFillFromModelText(row) {
            this.smartAutoFill(row, row.model);
        },

        // [4] การบันทึกส่งเรื่องร้องขอเบิกจ่ายวัสดุอุปกรณ์
        submitTransaction() {
            const invalid = this.form.items.some(i => {
                const codeFilled = i.itemCode && i.itemCode.trim();
                const nameFilled = i.name && i.name.trim();
                const qtyValid = i.qty > 0;
                return !codeFilled || !nameFilled || !qtyValid;
            });

            if (!this.form.user || invalid) {
                alert('กรุณากรอกชื่อผู้เบิก รหัสวัสดุ ชื่อวัสดุ และจำนวนให้ถูกต้องครบถ้วน!'); return;
            }

            this.form.items.forEach((item, idx) => {
                if (!item.itemId) {
                    item.itemId = `TEMP-${Date.now()}-${idx}`;
                }
                if (!item.unit) {
                    item.unit = this.units[0] || 'Panel';
                }
            });

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
            this.resetForm();
            this.page = 'logs';
        },

        // [5] ฟังก์ชันตรวจสอบและอนุมัติยอดสินค้าคลังโดยแอดมิน
        approveLog(logId) {
            const log = this.logs.find(l => l.id === logId);
            if(!log) return;

            if (log.type === 'OUT' && log.txnType === 'ACTUAL') {
                for (let row of log.items) {
                    if (row.itemId && row.itemId.toString().startsWith('TEMP-')) continue;
                    
                    const inv = this.inventory.find(i => i.id == row.itemId);
                    if (inv && inv.qty < row.qty) {
                        alert(`ไม่สามารถอนุมัติได้: วัสดุ ${row.itemCode} ในสต๊อกไม่พอ!`); 
                        return;
                    }
                }
            }

            const nowStr = new Date().toLocaleString('th-TH');

            log.items.forEach(row => {
                if (row.itemId && row.itemId.toString().startsWith('TEMP-')) return;
                
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
                    inv.lastUpdated = nowStr;
                }
            });

            log.status = 'APPROVED';
            log.approvedAt = Date.now();
            this.saveData();
            alert('อนุมัติและปรับปรุงสต๊อกเรียบร้อยแล้ว');
        },

        confirmActual(logId) {
            const log = this.logs.find(l => l.id === logId);
            if (!log) return;

            if (log.type === 'OUT') {
                for (let row of log.items) {
                    if (row.itemId && row.itemId.toString().startsWith('TEMP-')) continue;
                    
                    const inv = this.inventory.find(i => i.id == row.itemId);
                    if (inv && inv.qty < row.qty) {
                        alert(`ไม่สามารถเบิกจ่ายจริงได้: วัสดุ ${row.itemCode} ในสต๊อกไม่พอ!`); 
                        return;
                    }
                }
            }

            const nowStr = new Date().toLocaleString('th-TH');

            log.items.forEach(row => {
                if (row.itemId && row.itemId.toString().startsWith('TEMP-')) return;
                
                const inv = this.inventory.find(i => i.id == row.itemId);
                if (inv) {
                    const q = parseInt(row.qty);
                    if (log.type === 'OUT') {
                        inv.reserve_out = Math.max(0, (inv.reserve_out || 0) - q);
                        inv.qty -= q;
                    } else {
                        inv.reserve_in = Math.max(0, (inv.reserve_in || 0) - q);
                        inv.qty += q;
                    }
                    inv.lastUpdated = nowStr;
                }
            });

            log.txnType = 'ACTUAL';
            this.saveData();
            alert('เปลี่ยนสถานะและปรับปรุงยอดเป็นการเบิกจ่าย/นำเข้าจริง เรียบร้อยแล้ว!');
        },

        cancelLog(logId) {
            if (!confirm('ยืนยันการยกเลิกรายการนี้หรือไม่? สต๊อกทั้งหมดที่เกี่ยวข้องจะถูกปรับปรุงคืนค่าเดิม')) return;
            const log = this.logs.find(l => l.id === logId);
            if (!log) return;

            const nowStr = new Date().toLocaleString('th-TH');

            if (log.status === 'APPROVED') {
                log.items.forEach(row => {
                    if (row.itemId && row.itemId.toString().startsWith('TEMP-')) continue;
                    
                    const inv = this.inventory.find(i => i.id == row.itemId);
                    if (inv) {
                        const q = parseInt(row.qty);
                        if (log.type === 'OUT') {
                            if (log.txnType === 'ACTUAL') {
                                inv.qty += q;
                            } else {
                                inv.reserve_out = Math.max(0, (inv.reserve_out || 0) - q);
                            }
                        } else {
                            if (log.txnType === 'ACTUAL') {
                                inv.qty = Math.max(0, inv.qty - q);
                            } else {
                                inv.reserve_in = Math.max(0, (inv.reserve_in || 0) - q);
                            }
                        }
                        inv.lastUpdated = nowStr;
                    }
                });
            }

            log.status = 'CANCELLED';
            this.saveData();
            alert('ยกเลิกรายการและคืนค่าปรับสต๊อกเรียบร้อยแล้ว');
        },

        checkExpiredReservations() {
            let updated = false;
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            const nowStr = new Date().toLocaleString('th-TH');

            this.logs.forEach(log => {
                if (log.txnType === 'RESERVE' && log.status === 'APPROVED') {
                    const approvedTime = log.approvedAt || log.id;
                    if (now - approvedTime > thirtyDaysMs) {
                        log.status = 'EXPIRED';

                        log.items.forEach(row => {
                            if (row.itemId && row.itemId.toString().startsWith('TEMP-')) return;
                            
                            const inv = this.inventory.find(i => i.id == row.itemId);
                            if (inv) {
                                const q = parseInt(row.qty);
                                if (log.type === 'OUT') {
                                    inv.reserve_out = Math.max(0, (inv.reserve_out || 0) - q);
                                } else {
                                    inv.reserve_in = Math.max(0, (inv.reserve_in || 0) - q);
                                }
                                inv.lastUpdated = nowStr;
                            }
                        });
                        updated = true;
                    }
                }
            });

            if (updated) {
                this.saveData();
            }
        },

        // [6] การจัดการและเก็บพรีวิวไฟล์บันทึกแนบเอกสาร PDF
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

        // [7] ฟังก์ชันลงทะเบียนรหัสและแอดสินค้า Master Data เข้าสู่ระบบฐานข้อมูลหลัก
        generateItemCode() {
            if(!this.newItem.category) return;
            const prefix = this.newItem.category.substring(0, 3).toUpperCase();
            const count = this.inventory.filter(i => i.category === this.newItem.category).length + 1;
            this.newItem.itemCode = `${prefix}-${String(count).padStart(3, '0')}`;
        },

        addMaterial() {
            if(!this.newItem.name || !this.newItem.itemCode) return alert('กรุณาระบุรหัสและชื่อวัสดุ!');
            const nowStr = new Date().toLocaleString('th-TH');
            this.inventory.push({
                id: Date.now(),
                itemCode: this.newItem.itemCode.toUpperCase(),
                name: this.newItem.name.toUpperCase(),
                model: this.newItem.model.toUpperCase() || 'N/A',
                location: (this.newItem.location || '').toUpperCase() || 'N/A',
                category: this.newItem.category,
                unit: this.newItem.unit || this.units[0],
                qty: parseInt(this.newItem.qty) || 0,
                reserve_out: 0,
                reserve_in: 0,
                lastUpdated: nowStr,
                createdDate: nowStr
            });
            this.newItem = { itemCode: '', name: '', model: '', location: '', category: '', unit: this.units[0], qty: 0 };
            this.saveData();
        },

        deleteMaterial(id) {
            if(confirm('ลบข้อมูลถาวร? ข้อมูลจะถูกลบออกจาก Google Sheet ด้วย')) { 
                this.inventory = this.inventory.filter(item => item.id !== id); 
                this.saveData(); 
            }
        },

        addCategory() {
            if (!this.newCat.trim()) return alert('กรุณากรอกชื่อหมวดหมู่!');
            if (this.categories.includes(this.newCat.trim())) return alert('มีหมวดหมู่นี้อยู่แล้ว!');
            this.categories.push(this.newCat.trim());
            this.newCat = '';
            this.saveData();
        },

        removeCategory(idx) {
            if (confirm('ลบหมวดหมู่นี้หรือไม่? ข้อมูลจะถูกลบออกจาก Google Sheet ด้วย')) {
                this.categories.splice(idx, 1);
                this.saveData();
            }
        },

        addUnit() {
            if (!this.newUnit.trim()) return alert('กรุณากรอกหน่วยนับ!');
            const unitUpper = this.newUnit.trim().toUpperCase();
            if (this.units.includes(unitUpper)) return alert('มีหน่วยนับนี้อยู่แล้ว!');
            this.units.push(unitUpper);
            this.newUnit = '';
            this.saveData();
        },

        removeUnit(idx) {
            if (confirm('ลบหน่วยนับนี้หรือไม่? ข้อมูลจะถูกลบออกจาก Google Sheet ด้วย')) {
                this.units.splice(idx, 1);
                this.saveData();
            }
        },

        resetDropdownDefaults() {
            if (confirm('ต้องการล้างข้อมูลและกู้คืนตัวเลือก Dropdown หมวดหมู่และหน่วยนับสำรองจากระบบโค้ดเริ่มต้นหรือไม่?')) {
                this.categories = ['PV Module', 'Inverter', 'Cables', 'BOS', 'Tools', 'Mounting', 'Grounding'];
                this.units = ['Panel','Pcs', 'Set', 'Roll', 'BOX', 'Meter'];
                this.saveData();
                alert('คืนค่าเริ่มต้น Dropdown สำรองเรียบร้อยแล้ว');
            }
        },

        downloadCSV() {
            if (this.inventory.length === 0) return alert('ไม่มีข้อมูลสำหรับส่งออก!');
            let csv = '\uFEFF'; 
            csv += 'Code (รหัส),Material (ชื่อวัสดุ),Model (รุ่น),Location (ตำแหน่งจัดเก็บ),Category (หมวดหมู่),Balance (คงเหลือ),Reserve (จอง),Unit (หน่วย),Last Updated (อัปเดตล่าสุดเมื่อ)\n';
            this.inventory.forEach(item => {
                csv += `"${item.itemCode}","${item.name}","${item.model}","${item.location || '-'}","${item.category}",${item.qty},${item.reserve_out || 0},"${item.unit}","${item.lastUpdated || '-'}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', `CNES_Stock_Report.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        // บันทึกและอัปเดตข้อมูลลง LocalStorage + ส่งไปเขียนลง Google Sheet และเซิร์ฟเวอร์
        saveData() {
            localStorage.setItem('cnes_v178_inv', JSON.stringify(this.inventory));
            localStorage.setItem('cnes_v178_logs', JSON.stringify(this.logs));
            localStorage.setItem('cnes_v178_cats', JSON.stringify(this.categories));
            localStorage.setItem('cnes_v178_units', JSON.stringify(this.units));

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
                console.log("เซิร์ฟเวอร์ยังออฟไลน์อยู่ ดำเนินการเก็บบันทึกบน LocalStorage ของเครื่องนี้แทนชั่วคราว");
            });
        },

        t(en, th) { return `${en} (${th})`; }
    }
}