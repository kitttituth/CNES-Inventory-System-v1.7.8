// URL หลังบ้าน Google Sheets Web App
const API_URL = 'https://script.google.com/macros/s/AKfycbxe6ixhD0tIux9YZhZZi9NYIe5OeADp5PGqSTIQpD-Cd3tde5rk4rdOaqVlMQN6zvUw/exec';

// 🚀 ลิงก์โฟลเดอร์แชร์ของ Microsoft Teams (SharePoint) แยกตามประเภทเอกสาร 3 หมวด
const TEAMS_URLS = {
    PO: 'https://cnesthai.sharepoint.com/:f:/s/OperationTeam237/IgBDGNtphNFXQ4s16171MYHfAcwor2NyJ1iVyJpX0yFriBI?e=KzudSN',
    WITHDRAW: 'https://cnesthai.sharepoint.com/:f:/s/OperationTeam237/IgC1u8OuOZ5yRZdleGy4_3_CAQm85RQcEFlDv80ANmFhUps?e=dZVZsD',
    RECEIVE: 'https://cnesthai.sharepoint.com/:f:/s/OperationTeam237/IgDVvDSLvh5NRZsjMq4AFJ2YAf4_MJqZRZnXfHWtAeOPXMk?e=ReLchD'
};

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

        // [1] โหลดข้อมูลเริ่มต้น
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
                        let localSavedLogs = [];
                        try { localSavedLogs = JSON.parse(localStorage.getItem('cnes_v178_logs')) || []; } catch(e) {}

                        let localSavedInv = [];
                        try { localSavedInv = JSON.parse(localStorage.getItem('cnes_v178_inv')) || []; } catch(e) {}

                        if (serverData.inventory) {
                            this.inventory = serverData.inventory.map((serverItem, idx) => {
                                const localItem = localSavedInv.find(i => String(i.id).trim() === String(serverItem.id).trim() || i.itemCode === serverItem.itemCode) || localSavedInv[idx];
                                const poPdfData = (localItem && localItem.poPdfData) ? localItem.poPdfData : (serverItem.poPdfData || '');
                                const poPdfName = (serverItem.poPdfName && String(serverItem.poPdfName).trim()) ? serverItem.poPdfName : (localItem && localItem.poPdfName ? localItem.poPdfName : '');
                                return {
                                    ...serverItem,
                                    poPdfData: poPdfData,
                                    poPdfName: poPdfName
                                };
                            });
                        }

                        this.categories = serverData.categories || [];
                        this.units = serverData.units || [];

                        if (serverData.logs) {
                            this.logs = serverData.logs.map((serverLog, index) => {
                                const localLog = localSavedLogs.find(l => 
                                    String(l.id).trim() === String(serverLog.id).trim() ||
                                    (l.timestamp === serverLog.timestamp && l.user === serverLog.user)
                                ) || localSavedLogs[index];

                                const savedPurpose = (serverLog.purpose && serverLog.purpose.trim()) 
                                    ? serverLog.purpose 
                                    : (localLog && localLog.purpose ? localLog.purpose : 'Project');

                                const savedInspector = (serverLog.inspector && serverLog.inspector.trim()) 
                                    ? serverLog.inspector 
                                    : (localLog && localLog.inspector ? localLog.inspector : '');

                                const savedApprover = (serverLog.approver && serverLog.approver.trim()) 
                                    ? serverLog.approver 
                                    : (localLog && localLog.approver ? localLog.approver : '');

                                const savedPdfData = (localLog && localLog.pdfData) ? localLog.pdfData : (serverLog.pdfData || '');
                                const savedPdfName = (serverLog.pdfName && String(serverLog.pdfName).trim()) ? serverLog.pdfName : (localLog && localLog.pdfName ? localLog.pdfName : '');

                                return {
                                    ...serverLog,
                                    purpose: savedPurpose,
                                    inspector: savedInspector,
                                    approver: savedApprover,
                                    pdfData: savedPdfData,
                                    pdfName: savedPdfName
                                };
                            });
                        }

                        if (serverData.signatories) {
                            this.signatories = serverData.signatories;
                        } else if (this.logs && this.logs.length > 0) {
                            const projLog = this.logs.find(l => {
                                const p = (l.purpose || '').toUpperCase();
                                return p.includes('PROJECT') && l.inspector;
                            });
                            if (projLog) {
                                if (!this.signatories.project.inspector) this.signatories.project.inspector = projLog.inspector || '';
                                if (!this.signatories.project.approver) this.signatories.project.approver = projLog.approver || '';
                            }
                            const omLog = this.logs.find(l => {
                                const p = (l.purpose || '').toUpperCase();
                                return (p.includes('O&M') || p.includes('OM')) && l.inspector;
                            });
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

        getSignatoryInspector(log) {
            if (!log) return '';
            const p = (log.purpose || '').trim().toUpperCase();
            const isOM = p.includes('O&M') || p.includes('OM') || p.includes('O & M');
            const pKey = isOM ? 'om' : 'project';

            if (this.signatories && this.signatories[pKey] && this.signatories[pKey].inspector && this.signatories[pKey].inspector.trim()) {
                return this.signatories[pKey].inspector.trim();
            }
            return log.inspector ? log.inspector.trim() : ''; 
        },

        getSignatoryApprover(log) {
            if (!log) return '';
            const p = (log.purpose || '').trim().toUpperCase();
            const isOM = p.includes('O&M') || p.includes('OM') || p.includes('O & M');
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

            const p = (this.form.purpose || '').trim().toUpperCase();
            const isOM = p.includes('O&M') || p.includes('OM') || p.includes('O & M');
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

        hasPdf(log) {
            if (!log) return false;
            const d = String(log.pdfData || '').trim();
            const n = String(log.pdfName || '').trim();
            return ((d && d !== 'null' && d !== 'undefined' && (d.indexOf('http') === 0 || d.indexOf('data:') === 0 || d.indexOf('base64') > -1)) || (n && n !== 'null' && n !== 'undefined' && n.length > 0));
        },

        hasMaterialPdf(item) {
            if (!item) return false;
            const d = String(item.poPdfData || '').trim();
            const n = String(item.poPdfName || '').trim();
            return ((d && d !== 'null' && d !== 'undefined' && (d.indexOf('http') === 0 || d.indexOf('data:') === 0 || d.indexOf('base64') > -1)) || (n && n !== 'null' && n !== 'undefined' && n.length > 0));
        },

        // 🚀 [รันเปิดไฟล์ PDF อัตโนมัติ 100% หรือเปิดโฟลเดอร์ Teams ตามหมวดหมู่เอกสาร]
        viewPDF(pdfData, pdfName) {
            let targetData = String(pdfData || '').trim();
            const fileName = String(pdfName || '').trim();

            // 1. ถ้ามีข้อมูลไฟล์ Base64 ให้สร้างหน้าต่างเปิดไฟล์ PDF ขึ้นมาดูทันที
            if (targetData && (targetData.indexOf('data:application/pdf') === 0 || targetData.indexOf('base64,') > -1)) {
                try {
                    const base64Parts = targetData.split('base64,');
                    const mimeType = 'application/pdf';
                    const base64Clean = base64Parts[1].replace(/\s/g, ''); 
                    const byteCharacters = atob(base64Clean);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: mimeType });
                    if (blob.size > 0) {
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
                    }
                } catch (e) {
                    console.error("Failed to parse base64 PDF", e);
                }
            }

            // 2. ถ้ามี URL โดยตรง (Drive / Direct Web link)
            if (targetData && (targetData.indexOf('http://') === 0 || targetData.indexOf('https://') === 0)) {
                let directPdfUrl = targetData;
                if (targetData.indexOf('drive.google.com') > -1) {
                    const match = targetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (match && match[1]) {
                        directPdfUrl = `https://drive.google.com/file/d/${match[1]}/preview`;
                    }
                }
                const win = window.open(directPdfUrl, '_blank');
                if (!win) location.href = directPdfUrl;
                return;
            }

            // 3. หากมีเฉพาะ Log ชื่อไฟล์ ให้เปิดเข้าโฟลเดอร์ Microsoft Teams ตามหมวดหมู่เอกสาร
            if (fileName.includes('PO') || fileName.includes('[PO]')) {
                const win = window.open(TEAMS_URLS.PO, '_blank');
                if (!win) location.href = TEAMS_URLS.PO;
                return;
            } else if (fileName.includes('ใบรับสินค้า') || fileName.includes('RECEIVE') || fileName.includes('IN')) {
                const win = window.open(TEAMS_URLS.RECEIVE, '_blank');
                if (!win) location.href = TEAMS_URLS.RECEIVE;
                return;
            } else if (fileName.includes('ใบเบิก') || fileName.includes('WITHDRAW') || fileName.includes('OUT')) {
                const win = window.open(TEAMS_URLS.WITHDRAW, '_blank');
                if (!win) location.href = TEAMS_URLS.WITHDRAW;
                return;
            }

            alert('ไม่พบไฟล์เอกสาร PDF หรือโฟลเดอร์ในระบบ กรุณาแนบไฟล์ใหม่อีกครั้ง');
        },

        // 🚀 [อัปโหลดแนบใบเบิก/รับสินค้า บันทึกเนื้อหา PDF เพื่อรันดูอัตโนมัติ และแยกชื่อ Log ตามหมวด IN/OUT]
        uploadPDF(event, logId) {
            const log = this.logs.find(l => l.id == logId);
            if (!log) return;

            if (this.hasPdf(log)) {
                alert('รายการนี้เคยแนบไฟล์ PDF แล้ว หากต้องการแนบใหม่ กรุณากดปุ่มลบไฟล์เดิมก่อน');
                return;
            }

            const file = event.target.files[0];
            if (!file || file.type !== 'application/pdf') return alert('กรุณาเลือกไฟล์ PDF เท่านั้น');

            if (file.size > 10 * 1024 * 1024) {
                alert('ไฟล์ PDF มีขนาดใหญ่เกิน 10MB กรุณาย่อยขนาดไฟล์ก่อนอัปโหลด');
                return;
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Data = e.target.result;
                const docTypePrefix = log.type === 'IN' ? 'ใบรับสินค้า' : 'ใบเบิก';
                const formattedName = `[${docTypePrefix}]_${(log.id || '').replace(/[\/\\]/g, '-')}_${file.name}`;
                const targetTeamsUrl = log.type === 'IN' ? TEAMS_URLS.RECEIVE : TEAMS_URLS.WITHDRAW;
                
                // บันทึก Base64 เพื่อให้กดเปิดดูไฟล์ PDF ได้ทันทีอัตโนมัติ
                log.pdfData = base64Data;
                log.pdfName = formattedName;
                this.saveData();

                alert('กำลังอัปโหลดไฟล์ PDF ขึ้นระบบ กรุณารอสักครู่...');

                try {
                    const res = await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            action: 'uploadPdf',
                            logId: log.id,
                            category: docTypePrefix,
                            pdfName: formattedName,
                            pdfBase64: base64Data,
                            teamsUrl: targetTeamsUrl
                        })
                    });
                    
                    const resData = await res.json();
                    if (resData && resData.status === 'success' && resData.fileUrl) {
                        log.pdfData = resData.fileUrl;
                    }
                    this.saveData();
                    alert(`อัปโหลดไฟล์ PDF [${docTypePrefix}] เรียบร้อยแล้ว! (สามารถกดดูย้อนหลังได้ตลอดเวลา)`);
                } catch (err) {
                    this.saveData();
                    alert(`แนบไฟล์ PDF [${docTypePrefix}] เรียบร้อยแล้ว`);
                }
            };
            reader.readAsDataURL(file);
        },

        // 🚀 [ฟังก์ชันลบไฟล์ PDF ของสลิปประวัติเพื่ออัปโหลดใหม่]
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

        // 🚀 [อัปโหลดแนบใบ PO/Delivery บันทึกเนื้อหา PDF เพื่อรันดูอัตโนมัติ และแยกชื่อ Log ตามหัวข้อ PO]
        uploadMaterialPDF(event, itemId) {
            const item = this.inventory.find(i => i.id == itemId);
            if (!item) return;

            const file = event.target.files[0];
            if (!file || file.type !== 'application/pdf') return alert('กรุณาเลือกไฟล์ PDF เท่านั้น');

            if (file.size > 10 * 1024 * 1024) {
                alert('ไฟล์ PDF มีขนาดใหญ่เกิน 10MB กรุณาย่อยขนาดไฟล์ก่อนอัปโหลด');
                return;
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Data = e.target.result;
                const formattedName = `[PO]_${item.itemCode || 'ITEM'}_${file.name}`;
                const targetTeamsUrl = TEAMS_URLS.PO;

                // บันทึก Base64 เพื่อให้กดเปิดดูไฟล์ PDF ได้ทันทีอัตโนมัติ
                item.poPdfData = base64Data;
                item.poPdfName = formattedName;
                this.saveData();

                alert('กำลังอัปโหลดใบ PO/Delivery ขึ้นระบบ กรุณารอสักครู่...');

                try {
                    const res = await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            action: 'uploadPdf',
                            itemId: item.id,
                            category: 'PO',
                            pdfName: formattedName,
                            pdfBase64: base64Data,
                            teamsUrl: targetTeamsUrl
                        })
                    });
                    
                    const resData = await res.json();
                    if (resData && resData.status === 'success' && resData.fileUrl) {
                        item.poPdfData = resData.fileUrl;
                    }
                    this.saveData();
                    alert('แนบเอกสาร PO / ใบส่งของขึ้นระบบเรียบร้อยแล้ว!');
                } catch (err) {
                    this.saveData();
                    alert('แนบเอกสาร PO / ใบส่งของเรียบร้อยแล้ว');
                }
            };
            reader.readAsDataURL(file);
        },

        // 🚀 [ฟังก์ชันลบไฟล์ PO/Delivery ของวัสดุเพื่ออัปโหลดใหม่]
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