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
        
        // --- โครงสร้างผู้ลงนามแยกตาม Project / O&M ---
        signatories: {
            project: { inspector: 'นายดิเรก นวลสิงห์', approver: 'นายปองศักดิ์ สุทธปรีดา' },
            om: { inspector: 'นายกิตติธัช ทองวัชรไพบูลย์', approver: 'นายปองศักดิ์ สุทธปรีดา' }
        },

        // --- ฐานข้อมูลหลัก ---
        categories: [],
        units: [],
        inventory: [],
        logs: [],

        // --- ข้อมูลฟอร์มและการตั้งค่า ---
        form: { user: '', site: '', actionDate: '', txnType: 'ACTUAL', purpose: 'Project', items: [] },
        newCat: '',
        newUnit: '',
        newItem: { itemCode: '', name: '', model: '', location: '', category: '', unit: '', qty: 0, unitPrice: 0 }, 
        printData: null,

        // [1] โหลดข้อมูลเริ่มต้น
        async initData() {
            try { this.inventory = JSON.parse(localStorage.getItem('cnes_v178_inv')) || []; } catch(e) { this.inventory = []; }
            try { this.logs = JSON.parse(localStorage.getItem('cnes_v178_logs')) || []; } catch(e) { this.logs = []; }
            try { this.categories = JSON.parse(localStorage.getItem('cnes_v178_cats')) || []; } catch(e) { this.categories = []; }
            try { this.units = JSON.parse(localStorage.getItem('cnes_v178_units')) || []; } catch(e) { this.units = []; }
            
            try { 
                const savedSig = JSON.parse(localStorage.getItem('cnes_v178_signatories'));
                if (savedSig && (savedSig.project?.inspector || savedSig.om?.inspector)) {
                    this.signatories = savedSig;
                }
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

        // ล็อกค่า purpose ไม่ให้เด้งกลับเป็น Project
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
                        if (serverData.inventory) {
                            this.inventory = serverData.inventory;
                        }
                        this.categories = serverData.categories || [];
                        this.units = serverData.units || [];

                        const purposeMap = JSON.parse(localStorage.getItem('cnes_v178_purpose_map') || '{}');
                        if (serverData.logs && Array.isArray(serverData.logs)) {
                            this.logs = serverData.logs.map(sLog => {
                                const current = this.logs.find(l => String(l.id) === String(sLog.id));
                                let p = sLog.purpose;
                                
                                if (!p || p === 'undefined' || p === 'Project') {
                                    if (String(sLog.id).includes('-OM-') || String(sLog.id).includes('/OM-') || String(sLog.id).includes('/OM/')) {
                                        p = 'O&M';
                                    } else if (purposeMap[sLog.id]) {
                                        p = purposeMap[sLog.id];
                                    } else if (current && current.purpose) {
                                        p = current.purpose;
                                    }
                                }
                                
                                sLog.purpose = (p && (p.toUpperCase().includes('O&M') || p.toUpperCase().includes('OM'))) ? 'O&M' : (p || 'Project');
                                if (current && current.isConfirmedActual) {
                                    sLog.isConfirmedActual = true;
                                }
                                return sLog;
                            });
                        }

                        if (serverData.signatories && 
                            (serverData.signatories.project?.inspector || serverData.signatories.om?.inspector ||
                             serverData.signatories.project?.approver || serverData.signatories.om?.approver)) {
                            this.signatories = serverData.signatories;
                            localStorage.setItem('cnes_v178_signatories', JSON.stringify(this.signatories));
                        }

                        localStorage.setItem('cnes_v178_inv', JSON.stringify(this.inventory));
                        localStorage.setItem('cnes_v178_logs', JSON.stringify(this.logs));
                        localStorage.setItem('cnes_v178_cats', JSON.stringify(this.categories));
                        localStorage.setItem('cnes_v178_units', JSON.stringify(this.units));
                        localStorage.setItem('cnes_v178_unsynced', 'false');
                    }
                }
            } catch (err) {
                console.log("กำลังเชื่อมต่อเซิร์ฟเวอร์ฐานข้อมูล...");
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
            }).catch(err => {});
        },

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

        autoFillFromCodeText(row) { this.smartAutoFill(row, row.itemCode); },
        autoFillFromNameText(row) { this.smartAutoFill(row, row.name); },
        autoFillFromModelText(row) { this.smartAutoFill(row, row.model); },

        getLogPurpose(log) {
            if (!log) return 'Project';
            const p = String(log.purpose || '').trim().toUpperCase();
            const id = String(log.id || '').toUpperCase();
            if (p.includes('O&M') || p.includes('OM') || p.includes('O & M') || id.includes('-OM-') || id.includes('/OM-') || id.includes('/OM/')) {
                return 'O&M';
            }
            return 'Project';
        },

        getSignatoryInspector(log) {
            if (!log) return '';
            const isOM = this.getLogPurpose(log) === 'O&M';
            const pKey = isOM ? 'om' : 'project';

            if (this.signatories && this.signatories[pKey] && this.signatories[pKey].inspector && this.signatories[pKey].inspector.trim()) {
                return this.signatories[pKey].inspector.trim();
            }
            if (log.inspector && log.inspector.trim()) {
                return log.inspector.trim();
            }
            return isOM ? 'นายกิตติธัช ทองวัชรไพบูลย์' : 'นายดิเรก นวลสิงห์';
        },

        getSignatoryApprover(log) {
            if (!log) return '';
            const isOM = this.getLogPurpose(log) === 'O&M';
            const pKey = isOM ? 'om' : 'project';

            if (this.signatories && this.signatories[pKey] && this.signatories[pKey].approver && this.signatories[pKey].approver.trim()) {
                return this.signatories[pKey].approver.trim();
            }
            if (log.approver && log.approver.trim()) {
                return log.approver.trim();
            }
            return 'นายปองศักดิ์ สุทธปรีดา';
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

            if (this.page === 'out') {
                for (let row of this.form.items) {
                    const inv = this.inventory.find(i => i.id == row.itemId || (i.itemCode && i.itemCode.toUpperCase() === (row.itemCode || '').toUpperCase()));
                    if (inv) {
                        const reserveOut = parseInt(inv.reserve_out) || 0;
                        const availableQty = Math.max(0, (parseInt(inv.qty) || 0) - reserveOut);
                        const requestQty = parseInt(row.qty) || 0;

                        if (requestQty > availableQty) {
                            const activeReservation = this.logs.find(l => 
                                l.type === 'OUT' && 
                                l.txnType === 'RESERVE' && 
                                (l.status === 'APPROVED' || l.status === 'PENDING') &&
                                (l.items || []).some(item => item.itemId == inv.id || (item.itemCode && item.itemCode.toUpperCase() === (inv.itemCode || '').toUpperCase()))
                            );

                            let resDetail = '';
                            if (activeReservation) {
                                const resItem = activeReservation.items.find(item => item.itemId == inv.id || (item.itemCode && item.itemCode.toUpperCase() === (inv.itemCode || '').toUpperCase()));
                                const resQty = resItem ? resItem.qty : reserveOut;
                                resDetail = `\nเนื่องจากคุณ ${activeReservation.user} ทำการจองสินค้า โครงการ ${activeReservation.site || '-'} (วันที่จอง: ${activeReservation.actionDate || activeReservation.timestamp}) จำนวน ${resQty} ${inv.unit}`;
                            } else if (reserveOut > 0) {
                                resDetail = `\nเนื่องจากมียอดจองสินค้าค้างอยู่ในระบบจำนวน ${reserveOut} ${inv.unit}`;
                            }

                            alert(`⚠️ ไม่สามารถเบิกสินค้าได้!\nวัสดุ: ${inv.itemCode} (${inv.name}) มีสินค้าคงเหลือพร้อมเบิกเพียง ${availableQty} ${inv.unit} (จากสต๊อกคงเหลือทั้งหมด ${inv.qty} ${inv.unit})${resDetail}`);
                            return;
                        }
                    }
                }
            }

            this.form.items.forEach((item, idx) => {
                if (!item.itemId) item.itemId = `TEMP-${Date.now()}-${idx}`;
                if (!item.unit) item.unit = this.units[0] || 'Panel';
            });

            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const siteClean = (this.form.site || 'SITE').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const siteCode = siteClean.substring(0, 6) || 'GEN';
            const seq = String(this.logs.length + 1).padStart(3, '0');

            const p = String(this.form.purpose || 'Project').trim();
            const isOM = p.toUpperCase().includes('O&M') || p.toUpperCase().includes('OM') || p.toUpperCase().includes('O & M');
            const pKey = isOM ? 'om' : 'project';
            const pTag = isOM ? 'OM' : 'PRJ';

            const customId = `${yyyy}/${mm}/${dd}/${pTag}-${siteCode}-${seq}`;

            const mappedInspector = (this.signatories && this.signatories[pKey] && this.signatories[pKey].inspector) ? this.signatories[pKey].inspector.trim() : (isOM ? 'นายกิตติธัช ทองวัชรไพบูลย์' : 'นายดิเรก นวลสิงห์');
            const mappedApprover = (this.signatories && this.signatories[pKey] && this.signatories[pKey].approver) ? this.signatories[pKey].approver.trim() : 'นายปองศักดิ์ สุทธปรีดา';

            const newLog = {
                id: customId,
                timestamp: new Date().toLocaleString('th-TH'),
                actionDate: this.form.actionDate, 
                type: this.page.toUpperCase(),
                txnType: this.form.txnType,
                purpose: isOM ? 'O&M' : 'Project',
                inspector: mappedInspector,
                approver: mappedApprover,
                status: 'PENDING',
                user: this.form.user,
                site: this.form.site,
                items: JSON.parse(JSON.stringify(this.form.items)),
                pdfData: null,
                pdfName: ''
            };

            this.logs.unshift(newLog);

            const purposeMap = JSON.parse(localStorage.getItem('cnes_v178_purpose_map') || '{}');
            purposeMap[customId] = isOM ? 'O&M' : 'Project';
            localStorage.setItem('cnes_v178_purpose_map', JSON.stringify(purposeMap));

            this.saveData();
            alert(`บันทึกสำเร็จ! รหัสอ้างอิง: ${customId} [${newLog.purpose}] กรุณารอ Admin อนุมัติในหน้า Logs`);
            this.resetForm();
            this.page = 'logs';
        },

        approveLog(logId) {
            const log = this.logs.find(l => l.id == logId);
            if(!log) return;

            if (log.type === 'OUT' && log.txnType === 'ACTUAL') {
                for (let row of log.items) {
                    const inv = this.inventory.find(i => i.id == row.itemId || (i.itemCode && i.itemCode.toUpperCase() === (row.itemCode || '').toUpperCase()));
                    if (inv) {
                        const reserveOut = parseInt(inv.reserve_out) || 0;
                        const availableQty = Math.max(0, (parseInt(inv.qty) || 0) - reserveOut);
                        const requestQty = parseInt(row.qty) || 0;

                        if (requestQty > availableQty) {
                            const activeReservation = this.logs.find(l => 
                                l.id !== log.id &&
                                l.type === 'OUT' && 
                                l.txnType === 'RESERVE' && 
                                (l.status === 'APPROVED' || l.status === 'PENDING') &&
                                (l.items || []).some(item => item.itemId == inv.id || (item.itemCode && item.itemCode.toUpperCase() === (inv.itemCode || '').toUpperCase()))
                            );

                            let resDetail = '';
                            if (activeReservation) {
                                const resItem = activeReservation.items.find(item => item.itemId == inv.id || (item.itemCode && item.itemCode.toUpperCase() === (inv.itemCode || '').toUpperCase()));
                                const resQty = resItem ? resItem.qty : reserveOut;
                                resDetail = `\nเนื่องจากคุณ ${activeReservation.user} ทำการจองสินค้า โครงการ ${activeReservation.site || '-'} (วันที่จอง: ${activeReservation.actionDate || activeReservation.timestamp}) จำนวน ${resQty} ${inv.unit}`;
                            }

                            alert(`⚠️ ไม่สามารถอนุมัติได้: วัสดุ ${row.itemCode} มีสินค้าพร้อมเบิกเพียง ${availableQty} ${inv.unit}!${resDetail}`); 
                            return;
                        }
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

            if (log.txnType === 'RESERVE') {
                alert('✅ ยืนยันการจองสินค้าเรียบร้อยแล้ว!\nยอดจองจะแสดงเป็นป้ายสีส้มใน Dashboard และระบบได้กันยอดพร้อมเบิกไว้ให้เรียบร้อยแล้ว');
            } else {
                alert('อนุมัติและปรับปรุงสต๊อกเรียบร้อยแล้ว');
            }
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

            log.isConfirmedActual = true;
            log.confirmedAt = nowStr;
            log.note = (log.note ? log.note + ' | ' : '') + `จองเมื่อ ${log.actionDate} ยืนยันเบิกจริงสำเร็จเมื่อ ${nowStr}`;
            log.txnType = 'ACTUAL';

            this.saveData();
            alert('📦 ยืนยันการเบิกสินค้าจริงสำเร็จ!\nตัดยอดสต๊อกเรียบร้อยแล้ว และระบบได้บันทึกประวัติการจองและเบิกจริงไว้ครบถ้วน');
        },

        cancelLog(logId) {
            if (this.userRole !== 'admin') {
                alert('สิทธิ์เฉพาะ Admin เท่านั้น');
                return;
            }

            const log = this.logs.find(l => l.id == logId);
            if (!log) return;

            if (log.status === 'CANCELLED') {
                alert('รายการนี้ถูกยกเลิกไปแล้ว');
                return;
            }

            const itemListText = log.items.map(i => `${i.itemCode || i.name} (${i.qty} ${i.unit})`).join(', ');
            const confirmMsg = `⚠️ ยืนยันการยกเลิกรายการ (ก่อนอนุมัติ)?\n-----------------------------------------\n• รหัสอ้างอิง: ${log.id}\n• ไซต์งาน/โครงการ: ${log.site || '-'}\n• วัตถุประสงค์: ${log.purpose || 'Project'}\n• รายการ: ${itemListText}\n-----------------------------------------`;

            if (!confirm(confirmMsg)) return;

            const nowStr = new Date().toLocaleString('th-TH');
            log.status = 'CANCELLED';
            log.cancelledAt = nowStr;
            this.saveData();
            alert(`✅ ยกเลิกรายการ [${log.id}] เรียบร้อยแล้ว!`);
        },

        cancelApprovedLog(logId) {
            if (this.userRole !== 'admin') {
                alert('สิทธิ์เฉพาะ Admin เท่านั้น');
                return;
            }

            const log = this.logs.find(l => l.id == logId);
            if (!log) return;

            if (log.status === 'CANCELLED') {
                alert('รายการนี้ถูกยกเลิกไปแล้ว');
                return;
            }

            const pinInput = prompt(`⚠️ ป้องกันการกดยกเลิกผิดพลาด!\nรายการนี้ได้รับการอนุมัติไปแล้ว หากต้องการยกเลิกและคืนค่าสต๊อกทั้งหมด\nกรุณากรอกรหัส PIN ของ Admin (admincnes111111):`);
            
            if (pinInput === null) return;

            if (pinInput.trim() !== 'admincnes111111') {
                alert('❌ รหัส PIN ไม่ถูกต้อง! ไม่อนุญาตให้ยกเลิกรายการที่อนุมัติแล้ว');
                return;
            }

            const itemListText = log.items.map(i => `${i.itemCode || i.name} (${i.qty} ${i.unit})`).join(', ');
            const confirmMsg = `⚠️ ยืนยันรหัสถูกต้อง! คุณต้องการยกเลิกรายการนี้และคืนค่าสต๊อกทั้งหมดใช่หรือไม่?\n-----------------------------------------\n• รหัสอ้างอิง: ${log.id}\n• ไซต์งาน: ${log.site || '-'}\n• รายการ: ${itemListText}\n-----------------------------------------\nระบบจะทำการคืนค่าสต๊อก/ยอดจองทั้งหมดกลับสู่สถานะเดิมทันที!`;

            if (!confirm(confirmMsg)) return;

            const nowStr = new Date().toLocaleString('th-TH');

            log.items.forEach(row => {
                const inv = this.inventory.find(i => i.id == row.itemId || (i.itemCode && i.itemCode.toUpperCase() === (row.itemCode || '').toUpperCase()));
                if (inv) {
                    const q = parseInt(row.qty) || 0;
                    if (log.type === 'OUT') {
                        if (log.isConfirmedActual || log.txnType === 'ACTUAL') {
                            inv.qty += q;
                        } else if (log.txnType === 'RESERVE') {
                            inv.reserve_out = Math.max(0, (inv.reserve_out || 0) - q);
                        }
                    } else if (log.type === 'IN') {
                        if (log.isConfirmedActual || log.txnType === 'ACTUAL') {
                            inv.qty = Math.max(0, inv.qty - q);
                        } else if (log.txnType === 'RESERVE') {
                            inv.reserve_in = Math.max(0, (inv.reserve_in || 0) - q);
                        }
                    }
                    inv.lastUpdated = nowStr;
                }
            });

            log.status = 'CANCELLED';
            log.cancelledAt = nowStr;
            log.note = (log.note ? log.note + ' | ' : '') + `ยกเลิกหลังอนุมัติโดย Admin (ยืนยันรหัส PIN สำเร็จ) เมื่อ ${nowStr}`;

            this.saveData();
            alert(`✅ ยกเลิกรายการ [${log.id}] สำเร็จ!\nระบบได้คืนค่าปรับปรุงสต๊อกทั้งหมดกลับสู่สถานะเดิมเรียบร้อยแล้ว`);
        },

        checkExpiredReservations() {
            let updated = false;
            const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            const nowStr = new Date().toLocaleString('th-TH');

            this.logs.forEach(log => {
                if (log.txnType === 'RESERVE' && (log.status === 'APPROVED' || log.status === 'PENDING') && !log.isConfirmedActual) {
                    let startTime = 0;
                    if (log.actionDate) {
                        const parsedDate = new Date(log.actionDate).getTime();
                        if (!isNaN(parsedDate)) startTime = parsedDate;
                    }
                    if (!startTime && log.approvedAt) {
                        startTime = Number(log.approvedAt) || 0;
                    }
                    if (!startTime && !isNaN(Number(log.id))) {
                        startTime = Number(log.id);
                    }

                    if (startTime > 0 && (now - startTime > thirtyOneDaysMs)) {
                        const oldStatus = log.status;
                        log.status = 'EXPIRED';

                        if (oldStatus === 'APPROVED') {
                            log.items.forEach(row => {
                                const inv = this.inventory.find(i => i.id == row.itemId || (i.itemCode && i.itemCode.toUpperCase() === (row.itemCode || '').toUpperCase()));
                                if (inv) {
                                    const q = parseInt(row.qty) || 0;
                                    if (log.type === 'OUT') inv.reserve_out = Math.max(0, (inv.reserve_out || 0) - q);
                                    else inv.reserve_in = Math.max(0, (inv.reserve_in || 0) - q);
                                    inv.lastUpdated = nowStr;
                                }
                            });
                        }
                        updated = true;
                    }
                }
            });

            if (updated) this.saveData();
        },

        hasPdf(log) {
            if (!log) return false;
            const d = String(log.pdfData || '').trim();
            const n = String(log.pdfName || '').trim();
            return (d.startsWith('http') || d.startsWith('data:') || n.length > 0);
        },

        hasMaterialPdf(item) {
            if (!item) return false;
            const d = String(item.poPdfData || '').trim();
            const n = String(item.poPdfName || '').trim();
            const legacyLink = String(item['PO PDF Name'] || '').trim();
            return (d.startsWith('http') || d.startsWith('data:') || legacyLink.startsWith('http') || n.length > 0 || d.length > 0);
        },

        viewPDF(pdfData, pdfName) {
            let targetData = String(pdfData || '').trim();
            const fileName = String(pdfName || '').trim();

            if (!targetData.startsWith('http') && fileName.startsWith('http')) {
                targetData = fileName;
            }

            if (targetData.startsWith('http://') || targetData.startsWith('https://') || targetData.startsWith('msteams:')) {
                let directUrl = targetData;
                if (targetData.includes('drive.google.com')) {
                    const match = targetData.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (match && match[1]) {
                        directUrl = `https://drive.google.com/file/d/${match[1]}/preview`;
                    }
                }
                const win = window.open(directUrl, '_blank');
                if (!win) window.location.href = directUrl;
                return;
            }

            if (targetData.includes('base64,') || targetData.startsWith('data:application/pdf')) {
                try {
                    const base64Parts = targetData.split('base64,');
                    const byteCharacters = atob(base64Parts[1].replace(/\s/g, ''));
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: 'application/pdf' });
                    const blobUrl = URL.createObjectURL(blob);
                    const win = window.open(blobUrl, '_blank');
                    if (!win) {
                        const link = document.createElement('a');
                        link.href = blobUrl;
                        link.download = fileName || 'Document.pdf';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    }
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
                    return;
                } catch (e) {
                    console.error("Error opening base64 PDF", e);
                }
            }

            const fileIdentifier = fileName || targetData;
            if (fileIdentifier && fileIdentifier !== '' && fileIdentifier !== 'null' && fileIdentifier !== 'undefined') {
                let cleanName = fileIdentifier.replace(/^\[PO\]_/, '').replace(/\.pdf$/i, '').trim();
                let searchKeyword = cleanName;
                
                const parts = cleanName.split('_');
                if (parts.length >= 3) {
                    searchKeyword = parts.slice(parts.length - 2).join('_');
                }

                const teamsSearchUrl = `https://cnesthai.sharepoint.com/sites/OperationTeam237/_layouts/15/search.aspx?q=${encodeURIComponent(searchKeyword || cleanName)}`;
                const win = window.open(teamsSearchUrl, '_blank');
                if (!win) window.location.href = teamsSearchUrl;
                return;
            }

            alert('ไม่พบลิงก์ไฟล์เอกสาร PDF หรือกำลังประมวลผล กรุณาลองใหม่อีกครั้ง');
        },

        uploadPDF(event, logId) {
            const log = this.logs.find(l => l.id == logId);
            if (!log) return;

            const file = event.target.files[0];
            if (!file || file.type !== 'application/pdf') return alert('กรุณาเลือกไฟล์ PDF เท่านั้น');

            if (file.size > 15 * 1024 * 1024) {
                return alert('ไฟล์ PDF มีขนาดใหญ่เกิน 15MB กรุณาย่อยขนาดไฟล์ก่อนอัปโหลด');
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Data = e.target.result;
                const tag = log.type === 'IN' ? 'RECEIVE' : 'WITHDRAW';
                const formattedName = `[${tag}]_${(log.id || '').replace(/[\/\\]/g, '-')}_${file.name}`;

                log.pdfData = base64Data;
                log.pdfName = formattedName;
                this.saveData();

                alert(`กำลังอัปโหลดไฟล์ [${tag}] ขึ้นระบบคลาวด์... กรุณารอสักครู่`);

                try {
                    const res = await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            action: 'uploadPdf',
                            logId: log.id,
                            category: tag,
                            pdfName: formattedName,
                            pdfBase64: base64Data
                        })
                    });
                    
                    const resData = await res.json();
                    if (resData && resData.status === 'success' && resData.fileUrl) {
                        log.pdfData = resData.fileUrl;
                        this.saveData();
                        alert(`✅ อัปโหลดไฟล์ [${tag}] สำเร็จ! พร้อมเข้าถึงได้จากทุกอุปกรณ์`);
                    } else {
                        alert(`แนบไฟล์ [${tag}] เรียบร้อยแล้ว`);
                    }
                } catch (err) {
                    alert(`แนบไฟล์ [${tag}] เรียบร้อยแล้ว`);
                }
            };
            reader.readAsDataURL(file);
        },

        removePDF(logId) {
            const log = this.logs.find(l => l.id == logId);
            if (!log) return;
            if (confirm('คุณต้องการลบไฟล์ PDF นี้เพื่ออัปโหลดใหม่ใช่หรือไม่?')) {
                log.pdfData = null;
                log.pdfName = '';
                this.saveData();
                alert('ลบไฟล์ PDF เรียบร้อยแล้ว สามารถกดปุ่มแนบ PDF ใหม่ได้ทันที');
            }
        },

        uploadMaterialPDF(event, itemId) {
            const item = this.inventory.find(i => i.id == itemId);
            if (!item) return;

            const file = event.target.files[0];
            if (!file || file.type !== 'application/pdf') return alert('กรุณาเลือกไฟล์ PDF เท่านั้น');

            if (file.size > 15 * 1024 * 1024) {
                return alert('ไฟล์ PDF มีขนาดใหญ่เกิน 15MB กรุณาย่อยขนาดไฟล์ก่อนอัปโหลด');
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Data = e.target.result;
                const formattedName = `[PO]_${item.itemCode || 'ITEM'}_${file.name}`;

                item.poPdfData = base64Data;
                item.poPdfName = formattedName;
                this.saveData();

                alert('กำลังอัปโหลดเอกสาร PO/Delivery ขึ้นระบบคลาวด์... กรุณารอสักครู่');

                try {
                    const res = await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            action: 'uploadPdf',
                            itemId: item.id,
                            category: 'PO',
                            pdfName: formattedName,
                            pdfBase64: base64Data
                        })
                    });
                    
                    const resData = await res.json();
                    if (resData && resData.status === 'success' && resData.fileUrl) {
                        item.poPdfData = resData.fileUrl;
                        this.saveData();
                        alert('✅ อัปโหลดเอกสาร PO / ใบส่งของขึ้นระบบสำเร็จ! ทุกอุปกรณ์สามารถกดดู/โหลดได้ทันที');
                    } else {
                        alert('แนบเอกสาร PO / ใบส่งของเรียบร้อยแล้ว');
                    }
                } catch (err) {
                    alert('แนบเอกสาร PO / ใบส่งของเรียบร้อยแล้ว');
                }
            };
            reader.readAsDataURL(file);
        },

        removeMaterialPDF(itemId) {
            const item = this.inventory.find(i => i.id == itemId);
            if (!item) return;
            if (confirm('คุณต้องการลบเอกสาร PO / ใบส่งของนี้เพื่ออัปโหลดใหม่ใช่หรือไม่?')) {
                item.poPdfData = null;
                item.poPdfName = '';
                this.saveData();
                alert('ลบเอกสาร PO เรียบร้อยแล้ว สามารถกดแนบไฟล์ใหม่ได้ทันที');
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

        generateItemCode(force = false) {
            if (!this.newItem.category) return;
            if (this.newItem.itemCode && this.newItem.itemCode.trim() !== '' && !force) return;
            const prefix = this.newItem.category.substring(0, 3).toUpperCase();
            const count = this.inventory.filter(i => i.category === this.newItem.category).length + 1;
            this.newItem.itemCode = `${prefix}-${String(count).padStart(3, '0')}`;
        },

        updateItemCode(item) {
            if (!item || !item.itemCode) return;
            item.itemCode = item.itemCode.trim().toUpperCase();
            item.lastUpdated = new Date().toLocaleString('th-TH');
            this.saveData();
        },

        addMaterial() {
            if(!this.newItem.name || !this.newItem.itemCode) return alert('กรุณาระบุรหัสและชื่อวัสดุ!');
            const nowStr = new Date().toLocaleString('th-TH');
            const initQty = parseInt(this.newItem.qty) || 0;
            const price = parseFloat(this.newItem.unitPrice) || 0;

            this.inventory.push({
                id: Date.now(),
                itemCode: this.newItem.itemCode.trim().toUpperCase(),
                name: this.newItem.name.trim().toUpperCase(),
                model: this.newItem.model.trim().toUpperCase() || 'N/A',
                location: (this.newItem.location || '').trim().toUpperCase() || 'N/A',
                category: this.newItem.category,
                unit: this.newItem.unit || this.units[0],
                initialQty: initQty,
                qty: initQty,
                unitPrice: price,
                reserve_out: 0,
                reserve_in: 0,
                poPdfData: null,
                poPdfName: '',
                lastUpdated: nowStr,
                createdDate: nowStr
            });
            this.newItem = { itemCode: '', name: '', model: '', location: '', category: '', unit: this.units[0], qty: 0, unitPrice: 0 };
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
            localStorage.setItem('cnes_v178_signatories', JSON.stringify(this.signatories));
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

        // [แก้ไขตัวนับแถว] กำหนดแถวเริ่มต้นที่ 6 เพื่อให้สูตรแถวแรกตกที่แถว 8 (=H8*L8) ตรงแถวเป๊ะ 100%
        downloadCSV() {
            if (this.inventory.length === 0) return alert('ไม่มีข้อมูลสำหรับส่งออก!');

            const now = new Date();
            const dateStr = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
            const timeStr = now.toLocaleTimeString('th-TH');
            const fileDate = now.toISOString().split('T')[0];

            const sortedItems = this.inventory.slice().sort((a, b) => {
                if ((a.category || '') !== (b.category || '')) {
                    return (a.category || '').localeCompare(b.category || '');
                }
                if ((a.location || '') !== (b.location || '')) {
                    return (a.location || '').localeCompare(b.location || '');
                }
                return (a.itemCode || '').localeCompare(b.itemCode || '', undefined, { numeric: true });
            });

            let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
                <!--[if gte mso 9]>
                <xml>
                    <x:ExcelWorkbook>
                        <x:ExcelWorksheets>
                            <x:ExcelWorksheet>
                                <x:Name>Stock Audit Sheet</x:Name>
                                <x:WorksheetOptions>
                                    <x:DisplayGridlines/>
                                    <x:Print>
                                        <x:PaperSizeIndex>8</x:PaperSizeIndex>
                                        <x:HorizontalResolution>600</x:HorizontalResolution>
                                        <x:VerticalResolution>600</x:VerticalResolution>
                                    </x:Print>
                                    <x:PageSetup>
                                        <x:Layout x:Orientation="Landscape"/>
                                        <x:Header x:Margin="0.3"/>
                                        <x:Footer x:Margin="0.3"/>
                                        <x:PageMargins x:Bottom="0.5" x:Left="0.5" x:Right="0.5" x:Top="0.5"/>
                                    </x:PageSetup>
                                    <x:FitToPage/>
                                </x:WorksheetOptions>
                            </x:ExcelWorksheet>
                        </x:ExcelWorksheets>
                    </x:ExcelWorkbook>
                </xml>
                <![endif]-->
                <style>
                    @page {
                        size: A3 landscape;
                        margin: 1.2cm 1cm;
                        mso-page-orientation: landscape;
                    }
                    body { font-family: 'Sarabun', 'Calibri', Tahoma, sans-serif; }
                    .header-title { font-size: 18pt; font-weight: bold; color: #20336B; text-align: left; }
                    .header-sub { font-size: 13pt; font-weight: bold; color: #334155; text-align: left; }
                    .header-meta { font-size: 10pt; color: #475569; }
                    table { border-collapse: collapse; width: 100%; margin-top: 10px; }
                    
                    th { 
                        background-color: #4A6E94; 
                        color: #ffffff; 
                        font-weight: bold; 
                        border: 1px solid #2B4560; 
                        padding: 10px 6px; 
                        font-size: 10.5pt; 
                        text-align: center;
                        vertical-align: middle;
                    }
                    td { 
                        border: 1px solid #cbd5e1; 
                        padding: 7px 8px; 
                        font-size: 10pt; 
                        vertical-align: middle; 
                    }
                    .text-center { text-align: center; mso-number-format:"\\@"; }
                    .text-right { text-align: right; }
                    .text-left { text-align: left; }
                    .text-bold { font-weight: bold; }
                    .code-cell { font-family: 'Courier New', monospace; font-weight: bold; color: #1e40af; text-align: center; mso-number-format:"\\@"; }
                    .num-cell { mso-number-format:"\\#,##0"; }
                    .price-cell { mso-number-format:"\\#,##0\\.00"; text-align: right; }
                    .audit-cell { background-color: #fffdf5; border: 1px solid #e2e8f0; }
                    .category-tag { background-color: #f8fafc; font-weight: bold; }
                    .sign-title { font-weight: bold; text-align: center; padding-bottom: 40px; }
                </style>
            </head>
            <body>
                <table>
                    <tr>
                        <td colspan="16" class="header-title">บริษัท คริสเตียนีและนีลเส็น เอนเนอร์จี โซลูชันส์ จำกัด</td>
                    </tr>
                    <tr>
                        <td colspan="16" class="header-sub">รายงานตรวจนับพัสดุและยอดคงเหลือคลังสินค้า (Physical Inventory Count & Stock Audit Report - A3 Landscape)</td>
                    </tr>
                    <tr>
                        <td colspan="8" class="header-meta">วันที่จัดพิมพ์: ${dateStr} เวลา: ${timeStr} | ออกโดยระบบ CNES Inventory v1.7.8</td>
                        <td colspan="8" class="header-meta" style="text-align: right;">จำนวนรายการทั้งหมด: <b>${sortedItems.length}</b> รายการ</td>
                    </tr>
                    <tr><td colspan="16" style="border:none; height:12px;"></td></tr>
                    <thead>
                        <tr>
                            <th style="width: 45px;">ลำดับ<br>(No.)</th>
                            <th style="width: 120px;">รหัสพัสดุ<br>(Item Code)</th>
                            <th style="width: 240px;">ชื่อรายการพัสดุอุปกรณ์<br>(Material Description)</th>
                            <th style="width: 200px;">รุ่น / สเปก<br>(Model)</th>
                            <th style="width: 130px;">หมวดหมู่<br>(Category)</th>
                            <th style="width: 110px;">ตำแหน่งจัดเก็บ<br>(Location)</th>
                            <th style="width: 95px;">ยอดแรกเริ่ม<br>(Initial Qty)</th>
                            <th style="width: 95px;">ยอดในระบบ<br>(System Qty)</th>
                            <th style="width: 85px;">ยอดจองออก<br>(Reserved)</th>
                            <th style="width: 95px;">ยอดพร้อมใช้<br>(Available)</th>
                            <th style="width: 75px;">หน่วยนับ<br>(Unit)</th>
                            <th style="width: 105px;">ราคาต่อหน่วย<br>(Unit Price)</th>
                            <th style="width: 115px;">มูลค่าคงเหลือ<br>(Total Value)</th>
                            <th style="width: 120px;">[ตรวจนับจริง]<br>ยอดนับได้จริง (Count)</th>
                            <th style="width: 95px;">[ผลต่าง]<br>(+/- Diff)</th>
                            <th style="width: 190px;">[ผลการตรวจนับ]<br>สภาพพัสดุ / หมายเหตุ</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            let currentCat = '';
            let seq = 1;
            // ตั้งค่าแถวเริ่มต้นเป็น 6 (เนื่องจากแถว 1-6 คือส่วนหัวและหัวตารางใน Excel)
            let excelRowNum = 6;

            sortedItems.forEach(item => {
                const initQty = Number(item.initialQty !== undefined ? item.initialQty : item.qty) || 0;
                const balance = parseInt(item.qty) || 0;
                const reserved = parseInt(item.reserve_out) || 0;
                const available = Math.max(0, balance - reserved);
                const unitPrice = parseFloat(item.unitPrice) || 0;

                // เมื่อแทรกแถวหมวดหมู่ ให้นับแถว Excel เพิ่ม 1 (เช่น กลายเป็นแถว 7, 16)
                if (item.category !== currentCat) {
                    currentCat = item.category;
                    excelRowNum++;
                    html += `
                        <tr style="background-color: #f1f5f9;">
                            <td colspan="16" class="text-left text-bold" style="background-color: #e2e8f0; color: #1e293b; padding: 7px 10px; font-size: 10.5pt;">
                                📁 หมวดหมู่: ${currentCat}
                            </td>
                        </tr>
                    `;
                }

                // แถวของสินค้า (นับแถว Excel เพิ่ม 1 ให้ตกที่แถว 8, 9, 10... ตรงกับแถวใน Excel เป๊ะ)
                excelRowNum++;
                
                // สูตรจะตรงกับแถวตัวเองเสมอ: เช่น แถว 8 จะเป็น =H8*L8, แถว 17 จะเป็น =H17*L17
                const formulaStr = `=H${excelRowNum}*L${excelRowNum}`;

                html += `
                    <tr>
                        <td class="text-center">${seq++}</td>
                        <td class="code-cell">${item.itemCode || '-'}</td>
                        <td class="text-left text-bold">${item.name || '-'}</td>
                        <td class="text-left">${item.model || '-'}</td>
                        <td class="text-center category-tag">${item.category || '-'}</td>
                        <td class="text-center">${item.location || '-'}</td>
                        <td class="text-right num-cell">${initQty}</td>
                        <td class="text-right text-bold num-cell">${balance}</td>
                        <td class="text-right num-cell" style="color: #c2410c;">${reserved}</td>
                        <td class="text-right text-bold num-cell" style="color: #15803d;">${available}</td>
                        <td class="text-center">${item.unit || '-'}</td>
                        <td class="price-cell">${unitPrice.toFixed(2)}</td>
                        <td class="price-cell text-bold" style="color: #0f766e;" x:fmla="${formulaStr}">${formulaStr}</td>
                        <td class="audit-cell text-center"></td>
                        <td class="audit-cell text-center"></td>
                        <td class="audit-cell text-left"></td>
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
                <br><br>
                <table>
                    <tr>
                        <td colspan="5" style="border:none;" class="sign-title">
                            ผู้ตรวจนับพัสดุ (Counter)<br><br><br>
                            ลงชื่อ: .....................................................<br>
                            ( ..................................................... )<br>
                            วันที่: ...... / ...... / ..........
                        </td>
                        <td colspan="6" style="border:none;" class="sign-title">
                            ผู้ตรวจสอบสต๊อก (Auditor / Inspector)<br><br><br>
                            ลงชื่อ: .....................................................<br>
                            ( ..................................................... )<br>
                            วันที่: ...... / ...... / ..........
                        </td>
                        <td colspan="5" style="border:none;" class="sign-title">
                            ผู้อนุมัติผลตรวจนับ (Approver)<br><br><br>
                            ลงชื่อ: .....................................................<br>
                            ( ..................................................... )<br>
                            วันที่: ...... / ...... / ..........
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            `;

            const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', `CNES_Stock_Report_ตรวจนับพัสดุ_${fileDate}.xls`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
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
                console.log("บันทึกบน LocalStorage ชั่วคราว");
            });
        },

        t(en, th) { return `${en} (${th})`; }
    };
}