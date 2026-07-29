// URL หลังบ้าน Google Sheets Web App
const API_URL = 'https://script.google.com/macros/s/AKfycbxe6ixhD0tIux9YZhZZi9NYIe5OeADp5PGqSTIQpD-Cd3tde5rk4rdOaqVlMQN6zvUw/exec';

function cnesApp() {
    return {
        // --- ระบบสิทธิ์และหน้าจอ ---
        isLoggedIn: false,
        userRole: '',
        loginPin: '',
        page: 'dashboard',
        sidebarOpen: false, // เพิ่มเข้ามาเพื่อสลับเมนูบนอุปกรณ์เคลื่อนที่
        userModalOpen: false, // เพิ่มเข้ามาเพื่อแสดงคู่มือตามระดับสิทธิ์ของผู้ใช้งาน
        
        // --- ฐานข้อมูลหลัก ---
        categories: [],
        units: [],
        inventory: [],
        logs: [],
        
        // --- ข้อมูลฟอร์มและการตั้งค่า ---
        form: { user: '', site: '', txnType: 'ACTUAL', items: [] },
        newCat: '',
        newUnit: '',
        newItem: { itemCode: '', name: '', model: '', location: '', category: '', unit: '', qty: 0 }, // เพิ่มฟิลด์ location ในวัสดุใหม่
        printData: null,

        // [1] โหลดข้อมูลเริ่มต้น (อัปเกรดฐานข้อมูลสู่คีย์เซฟตี้ v1.7.8 ป้องกันจอขาว)
        async initData() {
            // โหลดข้อมูลด่านแรกจาก LocalStorage ของผู้ใช้ในเครื่องเบราว์เซอร์ปัจจุบัน
            try { this.inventory = JSON.parse(localStorage.getItem('cnes_v178_inv')) || []; } catch(e) { this.inventory = []; }
            try { this.logs = JSON.parse(localStorage.getItem('cnes_v178_logs')) || []; } catch(e) { this.logs = []; }
            try { this.categories = JSON.parse(localStorage.getItem('cnes_v178_cats')) || []; } catch(e) { this.categories = []; }
            try { this.units = JSON.parse(localStorage.getItem('cnes_v178_units')) || []; } catch(e) { this.units = []; }

            // ดึงข้อมูลหลักจาก Google Sheets
            await this.fetchServerData();

            // ตั้งเวลารันซิงก์ข้อมูลกับ Google Sheets อัตโนมัติทุกๆ 5 วินาที เพื่อให้อุปกรณ์ทุกเครื่องแสดงยอดตรงกันตลอดเวลา [ข้อ 1]
            setInterval(() => {
                this.fetchServerData();
            }, 5000);

            // ระบบสำรองคลังข้อมูลตัวเลือกในกรณีที่ถูกแอดมินล้างออกหมด (Dropdown Fallback)
            if (!this.categories || this.categories.length === 0) {
                this.categories = ['PV Module', 'Inverter', 'Cables', 'BOS', 'Tools', 'Mounting', 'Grounding'];
            }
            if (!this.units || this.units.length === 0) {
                this.units = ['Panel','Pcs', 'Set', 'Roll', 'BOX', 'Meter'];
            }
            
            // รันการตรวจสอบการหมดอายุการจองสินค้า (30 วัน) อัตโนมัติในตอนโหลดข้อมูลเริ่มต้น
            this.checkExpiredReservations();
            
            this.resetForm();
            
            // ปรับไปเช็กเซสชันจาก sessionStorage เพื่อให้สามารถเปิดล็อกอิน User และ Admin ทิ้งไว้พร้อมกันคนละแท็บได้
            const savedRole = sessionStorage.getItem('cnes_v178_role');
            if(savedRole) { 
                this.isLoggedIn = true; 
                this.userRole = savedRole; 
                if (this.userRole !== 'admin' && this.page === 'settings') {
                    this.page = 'dashboard';
                }
            }
        },

        // ดึงข้อมูลล่าสุดจาก Google Sheets มาปรับปรุงคลังในเครื่อง เพื่อให้มือถือและ PC ซิงก์ข้อมูลชุดเดียวกัน
        async fetchServerData() {
            // หากมีการบันทึกข้อมูลในเครื่องที่ยังไม่ได้ซิงก์สำเร็จกับ Google Sheets ให้ข้ามการดึงข้อมูลทับ
            if (localStorage.getItem('cnes_v178_unsynced') === 'true') {
                this.syncLocalToServer();
                return;
            }

            try {
                const res = await fetch(API_URL);
                if (res.ok) {
                    const serverData = await res.json();
                    if (serverData) {
                        this.inventory = serverData.inventory || [];
                        this.logs = serverData.logs || [];
                        this.categories = serverData.categories || [];
                        this.units = serverData.units || [];
                        
                        // ปรับปรุง LocalStorage ของเบราว์เซอร์เครื่องนี้ให้เท่ากับ Google Sheets ทันที
                        localStorage.setItem('cnes_v178_inv', JSON.stringify(this.inventory));
                        localStorage.setItem('cnes_v178_logs', JSON.stringify(this.logs));
                        localStorage.setItem('cnes_v178_cats', JSON.stringify(this.categories));
                        localStorage.setItem('cnes_v178_units', JSON.stringify(this.units));
                        localStorage.setItem('cnes_v178_unsynced', 'false');
                    }
                }
            } catch (err) {
                console.log("เชื่อมต่อ Google Sheets ไม่สำเร็จ รันระบบด้วยฐานข้อมูลเบราว์เซอร์ภายในชั่วคราว");
            }
        },

        // พยายามยิงข้อมูลในเครื่องไปอัปเดตลง Google Sheets อีกครั้ง
        syncLocalToServer() {
            const payload = {
                inventory: this.inventory,
                logs: this.logs,
                categories: this.categories,
                units: this.units
            };
            fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            }).then(() => {
                localStorage.setItem('cnes_v178_unsynced', 'false');
            }).catch(err => {
                // ยังบันทึกไม่ได้
            });
        },

        // [2] ระบบตรวจสอบ Login
        handleLogin() {
            if (this.loginPin === 'admincnes111111') { this.userRole = 'admin'; }
            else if (this.loginPin === '111111') { this.userRole = 'user'; }
            else { alert('PIN ไม่ถูกต้อง!'); return; }
            this.isLoggedIn = true;

            // บังคับเปลี่ยนหน้าไป Dashboard หาก User เข้าล็อกอิน เพื่อป้องกันการมองเห็นหน้า Settings [ข้อ 2]
            if (this.userRole !== 'admin' && this.page === 'settings') {
                this.page = 'dashboard';
            }

            // บันทึกสถานะบทบาทแยกระดับ Tab ด้วย sessionStorage ทำให้เปิดสลับแท็บรัน User / Admin ได้อิสระ
            sessionStorage.setItem('cnes_v178_role', this.userRole);
            this.loginPin = '';
        },

        logout() {
            this.isLoggedIn = false;
            this.userRole = '';
            sessionStorage.removeItem('cnes_v178_role');
        },

        // กรองข้อมูลและจัดเรียงรหัสวัสดุจากน้อยไปมากแยกตามกลุ่มหมวดหมู่สินค้าในหน้า Dashboard
        getInventoryByCategory(cat) {
            return this.inventory
                .filter(i => i.category === cat)
                .sort((a, b) => a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true, sensitivity: 'base' }));
        },

        // ดึงรายการวัสดุเพื่อจัดเรียงลำดับตามพจนานุกรมในหน้าตาราง Settings
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

        // ฟังก์ชันระบบค้นหาและเชื่อมโยงข้อมูลวัสดุอัตโนมัติจากคำค้นหาในทุกช่อง (Code / Description / Model) [ข้อ 3]
        smartAutoFill(row, queryText) {
            if (!queryText || !queryText.trim()) {
                row.itemId = '';
                return;
            }
            const q = queryText.trim().toUpperCase();

            // 1. ค้นหาแบบตรงตัวก่อน (Exact Match)
            let master = this.inventory.find(i => 
                (i.itemCode && i.itemCode.toUpperCase() === q) ||
                (i.name && i.name.toUpperCase() === q) ||
                (i.model && i.model.toUpperCase() === q)
            );

            // 2. หากไม่เจอ ให้ค้นหาแบบคำย่อย/ส่วนหนึ่งของข้อความ (Partial Match)
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
                row.itemId = ''; // หากไม่พบ สามารถให้สิทธิ์คีย์แมนนวลต่อได้
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
            // ปรับแต่งการตรวจสอบข้อมูล: ยินยอมให้สามารถพิมพ์ระบุรายการที่ไม่มีในระบบสต๊อกหลักส่งอนุมัติได้
            const invalid = this.form.items.some(i => {
                const codeFilled = i.itemCode && i.itemCode.trim();
                const nameFilled = i.name && i.name.trim();
                const qtyValid = i.qty > 0;
                return !codeFilled || !nameFilled || !qtyValid;
            });

            if (!this.form.user || invalid) {
                alert('กรุณากรอกชื่อผู้เบิก รหัสวัสดุ ชื่อวัสดุ และจำนวนให้ถูกต้องครบถ้วน!'); return;
            }

            // จัดการข้อมูลไอเทมที่กรอกเข้ามาด้วยตนเองโดยสร้าง ID ชั่วคราว และดึงหน่วยนับพื้นฐานเพื่อความปลอดภัยของสต๊อก
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
            this.resetForm(); // เคลียร์ฟอร์มให้สะอาดเพื่อรองรับการคีย์ข้อมูลในครั้งถัดไป
            this.page = 'logs';
        },

        // [5] ฟังก์ชันตรวจสอบและอนุมัติยอดสินค้าคลังโดยแอดมิน
        approveLog(logId) {
            const log = this.logs.find(l => l.id === logId);
            if(!log) return;

            if (log.type === 'OUT' && log.txnType === 'ACTUAL') {
                for (let row of log.items) {
                    // หากเป็นรายการคีย์เขียนมาเองข้างนอก จะไม่มีผลต่อยอดคงคลังหลักเพื่อความปลอดภัย
                    if (row.itemId && row.itemId.toString().startsWith('TEMP-')) continue;
                    
                    const inv = this.inventory.find(i => i.id == row.itemId);
                    if (inv && inv.qty < row.qty) {
                        alert(`ไม่สามารถอนุมัติได้: วัสดุ ${row.itemCode} ในสต๊อกไม่พอ!`); 
                        return;
                    }
                }
            }

            const nowStr = new Date().toLocaleString('th-TH'); // วันเวลาที่ทำธุรกรรมจริงสำเร็จ

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
                    // อัปเดตวันที่มีการเคลื่อนไหวสินค้า
                    inv.lastUpdated = nowStr;
                }
            });

            log.status = 'APPROVED';
            log.approvedAt = Date.now(); // เก็บเวลาที่กดอนุมัติสำหรับใช้ระบบนับถอยหลัง 30 วัน
            this.saveData();
            alert('อนุมัติและปรับปรุงสต๊อกเรียบร้อยแล้ว');
        },

        // ฟังก์ชันระบบสลับจากเอกสารจองสินค้า (RESERVE) เป็นเบิกจ่ายจริง (ACTUAL)
        confirmActual(logId) {
            const log = this.logs.find(l => l.id === logId);
            if (!log) return;

            // ตรวจสอบสต๊อกจริงก่อนว่าเพียงพอสำหรับการเบิกจ่ายจริงหรือไม่
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

            // คืนยอดจอง แล้วดำเนินการหัก/เพิ่มจำนวนในคลังสินค้าสต๊อกจริง
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
                    // อัปเดตวันที่มีการเคลื่อนไหวสินค้าจริง
                    inv.lastUpdated = nowStr;
                }
            });

            log.txnType = 'ACTUAL';
            this.saveData();
            alert('เปลี่ยนสถานะและปรับปรุงยอดเป็นการเบิกจ่าย/นำเข้าจริง เรียบร้อยแล้ว!');
        },

        // ฟังก์ชันยกเลิกรายการเบิกจ่ายหรือการจองสินค้า (Cancel)
        cancelLog(logId) {
            if (!confirm('ยืนยันการยกเลิกรายการนี้หรือไม่? สต๊อกทั้งหมดที่เกี่ยวข้องจะถูกปรับปรุงคืนค่าเดิม')) return;
            const log = this.logs.find(l => l.id === logId);
            if (!log) return;

            const nowStr = new Date().toLocaleString('th-TH');

            // หากได้รับการอนุมัติ (APPROVED) ไปแล้ว ต้องคืนค่าปรับปรุงยอดก่อนยกเลิก
            if (log.status === 'APPROVED') {
                log.items.forEach(row => {
                    if (row.itemId && row.itemId.toString().startsWith('TEMP-')) return;
                    
                    const inv = this.inventory.find(i => i.id == row.itemId);
                    if (inv) {
                        const q = parseInt(row.qty);
                        if (log.type === 'OUT') {
                            if (log.txnType === 'ACTUAL') {
                                inv.qty += q; // คืนสต๊อกจริง
                            } else {
                                inv.reserve_out = Math.max(0, (inv.reserve_out || 0) - q); // คืนยอดจอง
                            }
                        } else { // IN
                            if (log.txnType === 'ACTUAL') {
                                inv.qty = Math.max(0, inv.qty - q); // คืนสต๊อกจริง
                            } else {
                                inv.reserve_in = Math.max(0, (inv.reserve_in || 0) - q); // คืนยอดจอง
                            }
                        }
                        // อัปเดตวันที่มีการยกเลิกและนำของคืนคลังสินค้า
                        inv.lastUpdated = nowStr;
                    }
                });
            }

            log.status = 'CANCELLED';
            this.saveData();
            alert('ยกเลิกรายการและคืนค่าปรับสต๊อกเรียบร้อยแล้ว');
        },

        // ฟังก์ชันระบบสแกนตรวจสอบการจองสินค้าหมดอายุภายใน 30 วันนับจากวันที่อนุมัติ
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

                        // ปรับลดยอดจองออกจากการคิดคำนวณในระบบและหน้า Dashboard
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

        // [7] ฟังก์ชันลงทะเบียนรหัสและแอดสินค้า Master Data เข้าสู่ระบฐานข้อมูลหลัก
        generateItemCode() {
            if(!this.newItem.category) return;
            const prefix = this.newItem.category.substring(0, 3).toUpperCase();
            const count = this.inventory.filter(i => i.category === this.newItem.category).length + 1;
            this.newItem.itemCode = `${prefix}-${String(count).padStart(3, '0')}`;
        },

        addMaterial() {
            if(!this.newItem.name || !this.newItem.itemCode) return alert('กรุณาระบุรหัสและชื่อวัสดุ!');
            const nowStr = new Date().toLocaleString('th-TH'); // วันแรกเข้า
            this.inventory.push({
                id: Date.now(),
                itemCode: this.newItem.itemCode.toUpperCase(),
                name: this.newItem.name.toUpperCase(),
                model: this.newItem.model.toUpperCase() || 'N/A',
                location: (this.newItem.location || '').toUpperCase() || 'N/A', // เก็บบันทึกข้อมูลตำแหน่งจัดเก็บ
                category: this.newItem.category,
                unit: this.newItem.unit || this.units[0],
                qty: parseInt(this.newItem.qty) || 0,
                reserve_out: 0,
                reserve_in: 0,
                lastUpdated: nowStr, // บันทึกวันแรกเข้าเป็นวันเวลาเริ่มต้น
                createdDate: nowStr // บันทึกวันแรกเข้าคลังสินค้า เพื่อใช้ดึงข้อมูลย้อนหลังตามเงื่อนไขที่ 3
            });
            this.newItem = { itemCode: '', name: '', model: '', location: '', category: '', unit: this.units[0], qty: 0 };
            this.saveData();
        },

        deleteMaterial(id) {
            if(confirm('ลบข้อมูลถาวร?')) { 
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
            if (confirm('ลบหมวดหมู่นี้หรือไม่?')) {
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
            if (confirm('ลบหน่วยนับนี้หรือไม่?')) {
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
            const blobObj = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blobObj);
            link.setAttribute('download', `CNES_Stock_Report.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        // ฟังก์ชันระบบเซฟและอัปเดตข้อมูลทับร่วมกันลงในเบราว์เซอร์ และเก็บส่งไปที่ Google Sheets
        saveData() {
            // บันทึกสำรองลง LocalStorage (ภายในเบราว์เซอร์เครื่องปัจจุบัน)
            localStorage.setItem('cnes_v178_inv', JSON.stringify(this.inventory));
            localStorage.setItem('cnes_v178_logs', JSON.stringify(this.logs));
            localStorage.setItem('cnes_v178_cats', JSON.stringify(this.categories));
            localStorage.setItem('cnes_v178_units', JSON.stringify(this.units));
            localStorage.setItem('cnes_v178_unsynced', 'true');

            // ยิงข้อมูลอัปเดตไปบันทึกบน Google Sheets เพื่อให้อุปกรณ์ทุกเครื่องดึงไปใช้ซิงก์กัน
            const payload = {
                inventory: this.inventory,
                logs: this.logs,
                categories: this.categories,
                units: this.units
            };
            fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            }).then(() => {
                localStorage.setItem('cnes_v178_unsynced', 'false');
            }).catch(err => {
                console.log("ยังบันทึกลง Google Sheets ไม่สำเร็จ ดำเนินการเก็บบันทึกบน LocalStorage แทนชั่วคราว");
            });
        },

        t(en, th) { return `${en} (${th})`; }
    }
}