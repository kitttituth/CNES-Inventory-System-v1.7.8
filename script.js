// URL หลังบ้าน Google Sheets Web App
const API_URL = 'https://script.google.com/macros/s/AKfycbxe6ixhD0tIux9YZhZZi9NYIe5OeADp5PGqSTIQpD-Cd3tde5rk4rdOaqVlMQN6zvUw/exec';

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
        
        // --- โครงสร้างผู้ลงนามแยกตาม Project / O&M ---
        signatories: {
            project: { inspector: '', approver: '' },
            om: { inspector: '', approver: '' }
        },

        // --- ข้อมูลฟอร์มและการตั้งค่า ---
        form: { user: '', site: '', actionDate: '', txnType: 'ACTUAL', purpose: 'Project', items: [] },
        newCat: '',
        newUnit: '',
        newItem: { itemCode: '', name: '', model: '', location: '', category: '', unit: '', qty: 0 }, 
        printData: null,

        // [1] โหลดข้อมูลเริ่มต้น (อัปเกรดฐานข้อมูลสู่คีย์เซฟตี้ v1.7.8)
        async initData() {
            try { this.inventory = JSON.parse(localStorage.getItem('cnes_v178_inv')) || []; } catch(e) { this.inventory = []; }
            try { this.logs = JSON.parse(localStorage.getItem('cnes_v178_logs')) || []; } catch(e) { this.logs = []; }
            try { this.categories = JSON.parse(localStorage.getItem('cnes_v178_cats')) || []; } catch(e) { this.categories = []; }
            try { this.units = JSON.parse(localStorage.getItem('cnes_v178_units')) || []; } catch(e) { this.units = []; }
            
            try { 
                const savedSig = JSON.parse(localStorage.getItem('cnes_v178_signatories'));
                if (savedSig) this.signatories = savedSig;
            } catch(e) {}

            await this.fetchServerData();

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

        async fetchServerData() {
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
                        
                        // [เช็คซิงก์ข้อมูลข้ามแพลตฟอร์ม] ดึงค่าตั้งค่าผู้ลงนามจาก Google Sheets
                        if (serverData.signatories) {
                            this.signatories = serverData.signatories;
                        } else if (serverData.logs && serverData.logs.length > 0) {
                            // ระบบช่วยดึงจากประวัติสลับอัตโนมัติ หากเครื่องอื่นยังไม่ได้บันทึกก้อนหลัก
                            const projLog = serverData.logs.find(l => (l.purpose || '').toUpperCase().includes('PROJECT') && l.inspector);
                            if (projLog) {
                                if (!this.signatories.project.inspector) this.signatories.project.inspector = projLog.inspector || '';
                                if (!this.signatories.project.approver) this.signatories.project.approver = projLog.approver || '';
                            }
                            const omLog = serverData.logs.find(l => (l.purpose || '').toUpperCase().includes('O&M') && l.inspector);
                            if (omLog) {
                                if (!this.signatories.om.inspector) this.signatories.om.inspector = omLog.inspector || '';
                                if (!this.signatories.om.approver) this.signatories.om.approver = omLog.approver || '';
                            }
                        }

                        localStorage.setItem('cnes_v178_signatories', JSON.stringify(this.signatories));
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

        syncLocalToServer() {
            const payload = {
                inventory: this.inventory,
                logs: this.logs,
                categories: this.categories,
                units: this.units,
                signatories: this.signatories
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

        resetForm() {
            const todayStr = new Date().toISOString().split('T')[0];
            this.form = { 
                user: '', 
                site: '', 
                actionDate: todayStr, 
                txnType: 'ACTUAL', 
                purpose: 'Project',
                items: [{ itemId: '', itemCode: '', name: '', model: '', qty: 0, unit: this.units[0] || 'Panel' }] 
            };
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

        // --- ดึงรายชื่อผู้ตรวจสอบสินค้าแยกชัดเจนระหว่าง Project และ O&M ---
        getSignatoryInspector(log) {
            if (!log) return '';
            const isOM = (log.purpose || '').trim().toUpperCase().includes('O&M');
            const pKey = isOM ? 'om' : 'project';

            if (this.signatories && this.signatories[pKey] && this.signatories[pKey].inspector && this.signatories[pKey].inspector.trim()) {
                return this.signatories[pKey].inspector.trim();
            }
            return log.inspector ? log.inspector.trim() : ''; 
        },

        // --- ดึงรายชื่อผู้อนุมัติแยกชัดเจนระหว่าง Project และ O&M ---
        getSignatoryApprover(log) {
            if (!log) return '';
            const isOM = (log.purpose || '').trim().toUpperCase().includes('O&M');
            const pKey = isOM ? 'om' : 'project';

            if (this.signatories && this.signatories[pKey] && this.signatories[pKey].approver && this.signatories[pKey].approver.trim()) {
                return this.signatories[pKey].approver.trim();
            }
            return log.approver ? log.approver.trim() : ''; 
        },

        submitTransaction() {
            const invalid = this.form.items.some(i => {
                const codeFilled = i.itemCode && i.itemCode.trim();
                const nameFilled = i.name && i.name.trim();
                const qtyValid = i.qty > 0;
                return !codeFilled || !nameFilled || !qtyValid;
            });

            if (!this.form.user || !this.form.actionDate || invalid) {
                alert('กรุณากรอกชื่อผู้เบิก วันที่รับ/เบิกจริง รหัสวัสดุ ชื่อวัสดุ และจำนวนให้ถูกต้องครบถ้วน!'); return;
            }

            this.form.items.forEach((item, idx) => {
                if (!item.itemId) {
                    item.itemId = `TEMP-${Date.now()}-${idx}`;
                }
                if (!item.unit) {
                    item.unit = this.units[0] || 'Panel';
                }
            });

            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const siteClean = (this.form.site || 'SITE').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const siteCode = siteClean.substring(0, 6) || 'GEN';
            const seq = String(this.logs.length + 1).padStart(3, '0');
            const customId = `${yyyy}/${mm}/${dd}/${siteCode}-${seq}`;

            const isOM = (this.form.purpose || '').trim().toUpperCase().includes('O&M');
            const pKey = isOM ? 'om' : 'project';
            const mappedInspector = (this.signatories && this.signatories[pKey]) ? this.signatories[pKey].inspector : '';
            const mappedApprover = (this.signatories && this.signatories[pKey]) ? this.signatories[pKey].approver : '';

            this.logs.unshift({
                id: customId,
                timestamp: new Date().toLocaleString('th-TH'),
                actionDate: this.form.actionDate, 
                type: this.page.toUpperCase(),
                txnType: this.form.txnType,
                purpose: this.form.purpose || 'Project',
                inspector: mappedInspector,
                approver: mappedApprover,
                status: 'PENDING',
                user: this.form.user,
                site: this.form.site,
                items: JSON.parse(JSON.stringify(this.form.items)),
                pdfData: null,
                pdfName: ''
            });

            this.saveData();
            alert(`บันทึกสำเร็จ! รหัสอ้างอิง: ${customId} กรุณารอ Admin อนุมัติในหน้า Logs`);
            this.resetForm();
            this.page = 'logs';
        },

        approveLog(logId) {
            const log = this.logs.find(l => l.id == logId);
            if(!log) return;

            if (log.type === 'OUT' && log.txnType === 'ACTUAL') {
                for (let row of log.items) {
                    const inv = this.inventory.find(i => i.id == row.itemId || (i.itemCode && i.itemCode.toUpperCase() === (row.itemCode || '').toUpperCase()));
                    if (inv && inv.qty < row.qty) {
                        alert(`ไม่สามารถอนุมัติได้: วัสดุ ${row.itemCode} ในสต๊อกไม่พอ!`); 
                        return;
                    }
                }
            }

            const nowStr = new Date().toLocaleString('th-TH');

            log.items.forEach(row => {
                const inv = this.inventory.find(i => i.id == row.itemId || (i.itemCode && i.itemCode.toUpperCase() === (row.itemCode || '').toUpperCase()));
                if (inv) {
                    const q = parseInt(row.qty) || 0;
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
            const log = this.logs.find(l => l.id == logId);
            if (!log) return;

            if (log.type === 'OUT') {
                for (let row of log.items) {
                    const inv = this.inventory.find(i => i.id == row.itemId || (i.itemCode && i.itemCode.toUpperCase() === (row.itemCode || '').toUpperCase()));
                    if (inv && inv.qty < row.qty) {
                        alert(`ไม่สามารถเบิกจ่ายจริงได้: วัสดุ ${row.itemCode} ในสต๊อกไม่พอ!`); 
                        return;
                    }
                }
            }

            const nowStr = new Date().toLocaleString('th-TH');

            log.items.forEach(row => {
                const inv = this.inventory.find(i => i.id == row.itemId || (i.itemCode && i.itemCode.toUpperCase() === (row.itemCode || '').toUpperCase()));
                if (inv) {
                    const q = parseInt(row.qty) || 0;
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
            if (this.userRole !== 'admin') {
                alert('สิทธิ์ User ไม่สามารถยกเลิกรายการเบิก/รับ หรือสั่งจองได้ (สิทธิ์เฉพาะ Admin เท่านั้น)');
                return;
            }

            const log = this.logs.find(l => l.id == logId);
            if (!log) return;

            if (log.status === 'CANCELLED') {
                alert('รายการนี้ถูกยกเลิกไปแล้ว');
                return;
            }

            if (!confirm('ยืนยันการยกเลิกรายการนี้หรือไม่? สต๊อกทั้งหมดที่เกี่ยวข้องจะถูกปรับปรุงคืนค่าเดิม')) return;

            const nowStr = new Date().toLocaleString('th-TH');

            if (log.status === 'APPROVED') {
                log.items.forEach(row => {
                    const inv = this.inventory.find(i => i.id == row.itemId || (i.itemCode && i.itemCode.toUpperCase() === (row.itemCode || '').toUpperCase()));
                    if (inv) {
                        const q = parseInt(row.qty) || 0;
                        if (log.type === 'OUT') {
                            if (log.txnType === 'ACTUAL') {
                                inv.qty += q;
                            } else if (log.txnType === 'RESERVE') {
                                inv.reserve_out = Math.max(0, (inv.reserve_out || 0) - q);
                            }
                        } else if (log.type === 'IN') {
                            if (log.txnType === 'ACTUAL') {
                                inv.qty = Math.max(0, inv.qty - q);
                            } else if (log.txnType === 'RESERVE') {
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
                            const inv = this.inventory.find(i => i.id == row.itemId || (i.itemCode && i.itemCode.toUpperCase() === (row.itemCode || '').toUpperCase()));
                            if (inv) {
                                const q = parseInt(row.qty) || 0;
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

        uploadPDF(event, logId) {
            const log = this.logs.find(l => l.id == logId);
            if (!log) return;

            if (log.pdfData && log.pdfData.indexOf('http') === 0) {
                alert('รายการนี้เคยแนบไฟล์ PDF แล้ว ไม่สามารถแนบซ้ำได้ หากต้องการแนบใหม่ต้องไปลบข้อมูลใน Google Sheets ก่อน');
                return;
            }

            const file = event.target.files[0];
            if (!file || file.type !== 'application/pdf') return alert('กรุณาเลือกไฟล์ PDF เท่านั้น');
            
            const reader = new FileReader();
            reader.onload = (e) => {
                log.pdfData = e.target.result;
                log.pdfName = file.name;
                this.saveData();
                alert('แนบไฟล์ PDF เรียบร้อยแล้ว (กำลังอัปโหลดขึ้น Google Drive เพื่อให้ดูย้อนหลังได้ตลอดเวลา)');
            };
            reader.readAsDataURL(file);
        },

        removePDF(logId) {
            alert('ไม่สามารถลบไฟล์ PDF จากหน้าเว็บได้ หากต้องการแนบไฟล์ใหม่ กรุณาไปลบชื่อไฟล์ใน Google Sheets (แผ่น Logs คอลัมน์ PDF Name) ก่อนครับ');
        },

        uploadMaterialPDF(event, itemId) {
            const item = this.inventory.find(i => i.id == itemId);
            if (!item) return;

            const file = event.target.files[0];
            if (!file || file.type !== 'application/pdf') return alert('กรุณาเลือกไฟล์ PDF เท่านั้น');

            const reader = new FileReader();
            reader.onload = (e) => {
                item.poPdfData = e.target.result;
                item.poPdfName = file.name;
                this.saveData();
                alert('แนบเอกสาร PO / ใบส่งของเรียบร้อยแล้ว');
            };
            reader.readAsDataURL(file);
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

        generateItemCode() {
            if(!this.newItem.category) return;
            const prefix = this.newItem.category.substring(0, 3).toUpperCase();
            const count = this.inventory.filter(i => i.category === this.newItem.category).length + 1;
            this.newItem.itemCode = `${prefix}-${String(count).padStart(3, '0')}`;
        },

        addMaterial() {
            if(!this.newItem.name || !this.newItem.itemCode) return alert('กรุณาระบุรหัสและชื่อวัสดุ!');
            const nowStr = new Date().toLocaleString('th-TH');
            const initQty = parseInt(this.newItem.qty) || 0;
            this.inventory.push({
                id: Date.now(),
                itemCode: this.newItem.itemCode.toUpperCase(),
                name: this.newItem.name.toUpperCase(),
                model: this.newItem.model.toUpperCase() || 'N/A',
                location: (this.newItem.location || '').toUpperCase() || 'N/A',
                category: this.newItem.category,
                unit: this.newItem.unit || this.units[0],
                initialQty: initQty,
                qty: initQty,
                reserve_out: 0,
                reserve_in: 0,
                poPdfData: null,
                poPdfName: '',
                lastUpdated: nowStr,
                createdDate: nowStr
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

        saveSignatories() {
            this.saveData();
            alert('บันทึกและซิงก์ข้อมูลรายชื่อผู้ลงนามเรียบร้อยแล้ว ทุกอุปกรณ์จะเห็นข้อมูลชุดเดียวกัน');
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
            csv += 'Code (รหัส),Material (ชื่อวัสดุ),Model (รุ่น),Location (ตำแหน่งจัดเก็บ),Category (หมวดหมู่),Initial Qty (ยอดแรกเริ่ม),Balance (คงเหลือปัจจุบัน),Reserve (จอง),Unit (หน่วย),Created Date (วันแรกเข้า),Last Updated (อัปเดตล่าสุดเมื่อ)\n';
            this.inventory.forEach(item => {
                csv += `"${item.itemCode}","${item.name}","${item.model}","${item.location || '-'}","${item.category}",${item.initialQty !== undefined ? item.initialQty : item.qty},${item.qty},${item.reserve_out || 0},"${item.unit}","${item.createdDate || '-'}"\n`;
            });
            const blobObj = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blobObj);
            link.setAttribute('download', `CNES_Stock_Report.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        saveData() {
            localStorage.setItem('cnes_v178_inv', JSON.stringify(this.inventory));
            localStorage.setItem('cnes_v178_logs', JSON.stringify(this.logs));
            localStorage.setItem('cnes_v178_cats', JSON.stringify(this.categories));
            localStorage.setItem('cnes_v178_units', JSON.stringify(this.units));
            localStorage.setItem('cnes_v178_signatories', JSON.stringify(this.signatories));
            localStorage.setItem('cnes_v178_unsynced', 'true');

            const payload = {
                inventory: this.inventory,
                logs: this.logs,
                categories: this.categories,
                units: this.units,
                signatories: this.signatories
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