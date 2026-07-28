import { auth, db } from "./app.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, addDoc, query, where, getDocs, deleteDoc, updateDoc, writeBatch, serverTimestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { Filesystem, Directory, Encoding } from 'https://cdn.jsdelivr.net/npm/@capacitor/filesystem@latest/+esm';
import { Share } from 'https://cdn.jsdelivr.net/npm/@capacitor/share@latest/+esm';

let assignedSociety = "";
let editingDocId = null;
let pendingDeleteId = null;
let teamPhone = "919033406816";
let isMasterAdminUser = false;




// --- UI & Global Helpers ---
window.showModal = (msg, showConfirm = false) => {
    document.getElementById('modalMessage').innerText = msg;
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    if (confirmBtn) confirmBtn.style.display = showConfirm ? 'inline-block' : 'none';
    document.getElementById('customModal').style.display = 'block';
};
window.closeModal = () => { document.getElementById('customModal').style.display = 'none'; };

window.downloadCSV = async function(content, filename) {
    try {
        const isNative = window.location.href.includes("capacitor://") || window.Capacitor?.isNativePlatform();

        if (isNative) {
            // Native Platform: Save to cache and use Share API
            const tempFile = await Filesystem.writeFile({
                path: filename,
                data: content,
                directory: Directory.Cache,
                encoding: Encoding.UTF8
            });

            await Share.share({
                title: filename,
                url: tempFile.uri,
                dialogTitle: `Download ${filename}`
            });
        } else {
            // Web/Browser: Fallback to Data URI
            const base64Data = btoa(unescape(encodeURIComponent(content)));
            const dataUri = `data:text/csv;charset=utf-8;base64,${base64Data}`;

            const link = document.createElement("a");
            link.href = dataUri;
            link.setAttribute('download', filename);
            link.style.display = 'none';

            document.body.appendChild(link);
            link.click();

            setTimeout(() => {
                document.body.removeChild(link);
            }, 100);
        }
    } catch (err) {
        console.error("Download Error:", err);
        window.showModal("Download Error: " + (err.message || err));
    }
};

let owlWatcherTeamPhone = "919033406816";

async function fetchTeamPhone() {
    try {
        const configDoc = await getDoc(doc(db, "configs", "owlwatcher"));
        if (configDoc.exists()) {
            const data = configDoc.data();
            if (data.teamPhone) {
                owlWatcherTeamPhone = data.teamPhone.replace(/\D/g, '');
            }
        }
    } catch (err) {
        console.error("Failed to fetch dynamic master admin phone, using fallback.", err);
    }
}

async function updateContactUsWhatsAppLink() {
    try {
        await fetchTeamPhone();

        const whatsappLinks = document.querySelectorAll('a[href*="wa.me"]');
        whatsappLinks.forEach(link => {
            const urlObj = new URL(link.href);
            link.href = `https://wa.me/${owlWatcherTeamPhone}${urlObj.search}`;
        });
    } catch (err) {
        console.error("Failed to fetch team phone for WhatsApp link:", err);
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    await updateContactUsWhatsAppLink();

    // Intercept logout button to clear validation state
    document.getElementById("logoutBtn")?.addEventListener("click", () => {
        localStorage.removeItem("adminLoggedIn");
        document.getElementById("login-section").style.display = "block";
        document.getElementById("search-section").style.display = "none";
        document.getElementById("data-section").style.display = "none";
        const masterPanel = document.getElementById("master-admin-panel");
        if (masterPanel) masterPanel.style.display = "none";
    });
});

// --- Security Guard Management Logic ---

document.getElementById('searchGuardBtn')?.addEventListener('click', async () => {
    const searchName = document.getElementById('searchGuardName').value.trim().toLowerCase();
    if (!searchName) return window.showModal("Please enter a guard name to search.");

    try {
        const q = query(
            collection(db, "guards"), 
            where("society", "==", assignedSociety),
            where("name_lower", "==", searchName)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            window.showModal("No guard found with that name.");
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            document.getElementById('gEmail').value = data.email || docSnap.id;
            document.getElementById('gName').value = data.name || "";
            document.getElementById('gPhone').value = data.phone || "";
            window.showModal("Guard details loaded into form.");
        });
    } catch (err) {
        window.showModal("Error searching for guard.");
        console.error(err);
    }
});

document.getElementById('addGuardBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('gEmail').value.trim().toLowerCase();
    const name = document.getElementById('gName').value.trim();
    const phone = document.getElementById('gPhone').value.trim();

    if (!email || !name) return window.showModal("Guard Email and Name are required.");

    try {
        const nameLower = name.toLowerCase();
        const q = query(
            collection(db, "guards"),
            where("society", "==", assignedSociety),
            where("name_lower", "==", nameLower)
        );
        const querySnapshot = await getDocs(q);

        let targetDocId = email; 
        if (!querySnapshot.empty) {
            targetDocId = querySnapshot.docs[0].id;
        }

        await setDoc(doc(db, "guards", targetDocId), {
            email: email,
            name: name,
            name_lower: nameLower,
            phone: phone,
            society: assignedSociety,
            updatedAt: serverTimestamp()
        }, { merge: true });

        window.showModal("Guard saved successfully!");
    } catch (err) {
        window.showModal("Failed to save guard details.");
    }
});

document.getElementById('deleteGuardBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('gEmail').value.trim().toLowerCase();
    if (!email) return window.showModal("Please specify or search the guard email to delete.");

    try {
        await deleteDoc(doc(db, "guards", email));
        window.showModal("Guard deleted successfully.");
        document.getElementById('gEmail').value = "";
        document.getElementById('gName').value = "";
        document.getElementById('gPhone').value = "";
    } catch (err) {
        window.showModal("Failed to delete guard record.");
    }
});

// Replace the form submit event listener block with this updated version
const vehicleForm = document.getElementById("vehicleForm");
if (vehicleForm) {
    vehicleForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector("button[type='submit']");
    const originalBtnText = submitBtn.innerHTML;
    
    // Disable button and show loading spinner
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="loading-spinner"></div> Registering...';

    const flatNumber = document.getElementById("flatSelect").value;
    const vehicleNumber = document.getElementById("vehicleNumber").value.trim().toUpperCase();
    const mobileNumber = document.getElementById("mobileNumber").value.trim();
    const vehicleType = document.getElementById("vehicleType").value;
    const targetSociety = societyData.name || societyId;

    const vehiclesRef = collection(db, "vehicles");
    
    try {
        // 1. Verify Duplicate Entry
        const q = query(vehiclesRef, where("societyName", "==", targetSociety), where("vehicleNumber", "==", vehicleNumber));
        const existingSnap = await getDocs(q);

        if (!existingSnap.empty) {
            showModal("<p>❌ <b>Duplicate Entry</b><br>This vehicle number is already registered for this society.</p>");
            return;
        }

        // 2. Enforce Specific Limits
        const flatVehiclesQuery = query(vehiclesRef, where("societyName", "==", targetSociety), where("flatNumber", "==", flatNumber));
        const flatVehiclesSnap = await getDocs(flatVehiclesQuery);

        let current4WheelerCount = 0;
        let current2WheelerCount = 0;

        flatVehiclesSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (data.vehicleType === "4-Wheeler") current4WheelerCount++;
            if (data.vehicleType === "2-Wheeler") current2WheelerCount++;
        });

        const max4Wheeler = societyData.max4Wheeler !== undefined ? societyData.max4Wheeler : 1;
        const max2Wheeler = societyData.max2Wheeler !== undefined ? societyData.max2Wheeler : 2;

        if (vehicleType === "4-Wheeler" && current4WheelerCount >= max4Wheeler) {
            showModal(`<p>⚠️ Limit Reached! Only <b>${max4Wheeler}</b> Four-Wheeler(s) are allowed per flat.</p>`);
            return;
        }

        if (vehicleType === "2-Wheeler" && current2WheelerCount >= max2Wheeler) {
            showModal(`<p>⚠️ Limit Reached! Only <b>${max2Wheeler}</b> Two-Wheeler(s) are allowed per flat.</p>`);
            return;
        }

        // 3. Save to Firestore
        await addDoc(vehiclesRef, {
            societyName: targetSociety,
            flatNumber: flatNumber,
            vehicleNumber: vehicleNumber,
            mobileNumber: mobileNumber,
            vehicleType: vehicleType,
            timestamp: new Date()
        });
        showModal("<p>✅ Vehicle registered successfully!</p>");
        setTimeout(() => window.location.href = "index.html", 1500);
    } catch (err) {
        console.error(err);
        showModal("<p>❌ Error saving entry. Try again.</p>");
    } finally {
        // Restore button state
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
});


// --- Vehicle Search Logic ---
document.getElementById('adminSearchBtn')?.addEventListener('click', async () => {
    const searchVal = document.getElementById('adminSearch').value.trim().toUpperCase();
    const resultsDiv = document.getElementById('admin-results');
    if (!searchVal) return window.showModal("Please enter a vehicle number to search.");

    resultsDiv.innerHTML = "Searching...";
    try {
        const q = query(collection(db, "vehicles"), where("vehicleNumber", "==", searchVal), where("societyName", "==", assignedSociety));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            resultsDiv.innerHTML = "<p>No vehicle found.</p>";
            return;
        }

        window.deleteVehicleDoc = async (docId) => {
            try {
                await deleteDoc(doc(db, "vehicles", docId));
                window.showModal("Vehicle deleted from registry.");
                document.getElementById('admin-results').innerHTML = "";
            } catch (err) {
                window.showModal("Failed to delete vehicle record.");
            }
        };

        resultsDiv.innerHTML = "";
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            resultsDiv.innerHTML += `
                <div style="background:#f4ece0; padding:10px; margin-top:5px; border-radius:8px; font-family: sans-serif; font-size: 0.95rem;">
                    <b>Vehicle:</b> ${data.vehicleNumber}<br>
                    <b>Vehicle Type:</b> ${data.vehicleType}<br>
                    <b>Flat/Name:</b> ${data.flatNumber}<br>
                   <b> Call:</b> <a href="tel:${data.mobileNumber}" style="color: #0066cc; text-decoration: none;">${data.mobileNumber}</a><br><br>
                    <button onclick="window.deleteVehicleDoc('${docSnap.id}')" style="background:#d32f2f; color: white; border: none; border-radius: 4px; font-size:0.9rem; padding:5px 10px; cursor: pointer;">Delete</button>
                </div>
            `;
        });
    } catch (err) {
        window.showModal("Error searching vehicle data.");
    }
});

document.getElementById('saveBtn')?.addEventListener('click', async () => {
    const vNum = document.getElementById('vNum').value.trim().toUpperCase();
    const fNum = document.getElementById('fNum').value.trim();
    const mNum = document.getElementById('mNum').value.trim();
    const vType = document.getElementById('vType').value;

    if (!vNum || !fNum) return window.showModal("Vehicle number and Flat number/Name are required.");

    try {
        const q = query(
            collection(db, "vehicles"), 
            where("vehicleNumber", "==", vNum), 
            where("societyName", "==", assignedSociety)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const existingDocId = querySnapshot.docs[0].id;
            await setDoc(doc(db, "vehicles", existingDocId), {
                flatNumber: fNum,
                mobileNumber: mNum,
                vehicleType: vType,
                updatedAt: serverTimestamp()
            }, { merge: true });

            window.showModal("Vehicle details updated successfully!");
        } else {
            await addDoc(collection(db, "vehicles"), {
                vehicleNumber: vNum,
                flatNumber: fNum,
                mobileNumber: mNum,
                vehicleType: vType,
                societyName: assignedSociety,
                createdAt: serverTimestamp()
            });

            window.showModal("Vehicle saved to registry successfully!");
        }

        document.getElementById('vNum').value = "";
        document.getElementById('fNum').value = "";
        document.getElementById('mNum').value = "";
    } catch (err) {
        window.showModal("Failed to save vehicle.");
        console.error(err);
    }
});

function buildTimeDropdownHTML(idPrefix) {
    let hourOptions = '<option value="">HH</option>';
    for (let i = 1; i <= 12; i++) {
        let hStr = i < 10 ? '0' + i : i;
        hourOptions += `<option value="${hStr}">${hStr}</option>`;
    }

    let minOptions = '<option value="00">00</option><option value="15">15</option><option value="30">30</option><option value="45">45</option>';

    return `
        <div style="display: flex; gap: 5px; align-items: center; display: inline-flex;">
            <select id="${idPrefix}Hour" style="padding: 6px; border-radius: 6px; border: 1px solid #d7ccc8; background: #fff;">${hourOptions}</select>
            <span>:</span>
            <select id="${idPrefix}Min" style="padding: 6px; border-radius: 6px; border: 1px solid #d7ccc8; background: #fff;">${minOptions}</select>
            <select id="${idPrefix}AmPm" style="padding: 6px; border-radius: 6px; border: 1px solid #d7ccc8; background: #fff;">
                <option value="AM">AM</option>
                <option value="PM">PM</option>
            </select>
        </div>
    `;
}

function getSelectedTimeString(idPrefix) {
    const hh = document.getElementById(`${idPrefix}Hour`).value;
    const mm = document.getElementById(`${idPrefix}Min`).value;
    const ap = document.getElementById(`${idPrefix}AmPm`).value;

    if (!hh) return null;

    let hour24 = parseInt(hh, 10);
    if (ap === "PM" && hour24 < 12) hour24 += 12;
    if (ap === "AM" && hour24 === 12) hour24 = 0;

    const formattedHour24 = hour24 < 10 ? '0' + hour24 : hour24;
    return `${formattedHour24}:${mm}`;
}

document.getElementById('downloadTemplateBtn')?.addEventListener('click', () => {
    const csvContent = "VehicleNumber,FlatNumber/Name,MobileNumber,VehicleType\nKA01AB1234,101,9876543210,2W\n";
    window.downloadCSV(csvContent, "vehicle_template.csv");
});

document.addEventListener('DOMContentLoaded', () => {

    document.getElementById('masterSaveSocietyBtn')?.addEventListener('click', async () => {
        const newSociety = document.getElementById('masterSocietyInput').value.trim();
        if (!newSociety) return window.showModal("Please enter a valid society name.");
        
        try {
            const q = query(collection(db, "admins"), where("society", "==", newSociety));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                return window.showModal(`Society "${newSociety}" does not exist in the system.`);
            }

            assignedSociety = newSociety;
            window.showModal(`Active society switched to: ${assignedSociety}`);
            
            if (typeof loadNoticeData === 'function') loadNoticeData();
            if (typeof loadFacilitiesDropdown === 'function') loadFacilitiesDropdown();
            if (typeof loadActiveBookings === 'function') loadActiveBookings();

            let resultsContainer = document.getElementById('master-society-data');
            if (!resultsContainer) {
                resultsContainer = document.createElement('div');
                resultsContainer.id = 'master-society-data';
                resultsContainer.style.cssText = "margin-top: 15px; text-align: left; font-size: 0.9rem; background: #fff; padding: 10px; border-radius: 6px; border: 1px solid #d32f2f;";
                document.getElementById('master-admin-panel').appendChild(resultsContainer);
            }

            resultsContainer.innerHTML = `<b>Linked Data for ${assignedSociety}:</b><br>Found ${querySnapshot.size} admin profile(s) linked to this society.`;

        } catch (err) {
            console.error("Error verifying society existence:", err);
            window.showModal("Failed to verify society name.");
        }
    });

    async function loadNoticeData() {
        if (!assignedSociety) return;
        const noticeDocRef = doc(db, "notices", assignedSociety);
        const docSnap = await getDoc(noticeDocRef);
        
        const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
        const formatter = new Intl.DateTimeFormat('en-CA', options);
        const currentIstDateStr = formatter.format(new Date());

        if (docSnap.exists()) {
            const data = docSnap.data();
            let todayMsg = data.todayMessage || "";
            let tomorrowMsg = data.tomorrowMessage || "";
            let noticeDate = data.date || "";

            if (noticeDate && noticeDate < currentIstDateStr) {
                todayMsg = tomorrowMsg;
                tomorrowMsg = "";
                noticeDate = currentIstDateStr;

                try {
                    await setDoc(noticeDocRef, {
                        todayMessage: todayMsg,
                        tomorrowMessage: tomorrowMsg,
                        date: noticeDate,
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                } catch (err) {
                    console.error("Failed rollover:", err);
                }
            }

            if (document.getElementById('todayMsg')) document.getElementById('todayMsg').value = todayMsg;
            if (document.getElementById('tomorrowMsg')) document.getElementById('tomorrowMsg').value = tomorrowMsg;
        }
    }

    document.getElementById('masterSavePhoneBtn')?.addEventListener('click', async () => {
        const newPhone = document.getElementById('masterPhoneInput').value.trim();
        if (!newPhone) return window.showModal("Please enter a valid phone number.");
        
        try {
            await setDoc(doc(db, "configs", "owlwatcher"), {
                teamPhone: newPhone
            }, { merge: true });

            teamPhone = newPhone;
            window.showModal(`Team WhatsApp phone updated and saved to database: ${teamPhone}`);
        } catch (err) {
            console.error("Error saving team phone:", err);
            window.showModal("Failed to save phone number.");
        }
    });

    document.getElementById('saveAllFacilityNamesBtn')?.addEventListener('click', saveAllFacilityNames);

    const timeContainer = document.getElementById('bookingTimeContainer');
    if (timeContainer) {
        timeContainer.innerHTML = `
            <div style="margin-bottom: 10px;">
                <label style="display: block; font-size: 0.9rem; margin-bottom: 3px;">Start Time:</label>
                ${buildTimeDropdownHTML('start')}
            </div>
            <div>
                <label style="display: block; font-size: 0.9rem; margin-bottom: 3px;">End Time:</label>
                ${buildTimeDropdownHTML('end')}
            </div>
        `;
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const adminDoc = await getDoc(doc(db, "admins", user.email));
            if (adminDoc.exists()) {
                const adminData = adminDoc.data();
                assignedSociety = adminData.society || "";
                isMasterAdminUser = adminData.isMaster || false;

                document.getElementById('login-section').style.display = 'none';
                document.getElementById('search-section').style.display = 'block';
                document.getElementById('data-section').style.display = 'block';

                if (isMasterAdminUser) {
                    const bulkSection = document.getElementById('bulk-section');
                    if (bulkSection) bulkSection.style.display = 'block';

                    const masterPanel = document.getElementById('master-admin-panel');
                    if (masterPanel) {
                        masterPanel.style.display = 'block';
                        document.getElementById('masterSocietyInput').value = assignedSociety;
                        document.getElementById('masterPhoneInput').value = teamPhone;
                    }
                }
                
                loadNoticeData();
                loadFacilitiesDropdown();
                await cleanupOldBookings(); 
                loadActiveBookings();      
                
            } else {
                window.showModal("Unauthorized access.");
                signOut(auth);
            }
        } else {
            document.getElementById('login-section').style.display = 'block';
            document.getElementById('search-section').style.display = 'none';
            document.getElementById('data-section').style.display = 'none';
        }
    });

    // --- Login Logic with Admin Verification and Custom Modal Messages ---
    document.getElementById('loginBtn')?.addEventListener('click', async () => {
        const emailInput = document.getElementById('email');
        const passInput = document.getElementById('pass');

        if (!emailInput || !passInput) return;

        const email = emailInput.value.trim().toLowerCase();
        const pass = passInput.value.trim();

        if (!email || !pass) {
            window.showModal("Pls enter email id");
            return;
        }

        try {
            // Check if email is registered as an admin first
            const adminDocRef = doc(db, "admins", email);
            const adminDocSnap = await getDoc(adminDocRef);

            if (!adminDocSnap.exists()) {
                window.showModal("Invalid credentials");
                return;
            }

            await signInWithEmailAndPassword(auth, email, pass);
            localStorage.setItem("adminLoggedIn", "true");
            window.showModal("Login successful");
        } catch (e) {
            console.error("Login error code:", e.code);
            if (e.code === 'auth/invalid-email' || 
                e.code === 'auth/invalid-credential' || 
                e.code === 'auth/user-not-found' || 
                e.code === 'auth/wrong-password') {
                window.showModal("Invalid credentials");
            } else if (e.code === 'auth/too-many-requests') {
                window.showModal("Too many attempts try again later");
            } else {
                window.showModal("Invalid credentials");
            }
        }
    });

    // --- Forgot Password Logic for Admin ---
    document.getElementById('forgotPasswordBtn')?.addEventListener('click', async () => {
        const emailInput = document.getElementById('email');
        const email = emailInput ? emailInput.value.trim().toLowerCase() : "";

        if (!email) {
            window.showModal("Pls enter email id");
            return;
        }

        try {
            const adminDocRef = doc(db, "admins", email);
            const adminDocSnap = await getDoc(adminDocRef);

            if (!adminDocSnap.exists()) {
                window.showModal("Invalid credentials");
                return;
            }

            await sendPasswordResetEmail(auth, email);
            window.showModal("Password reset link sent to your email!");
        } catch (error) {
            console.error("Error sending password reset email:", error);
            if (error.code === 'auth/invalid-email') {
                window.showModal("Invalid credentials");
            } else if (error.code === 'auth/user-not-found') {
                window.showModal("Invalid credentials");
            } else if (error.code === 'auth/too-many-requests') {
                window.showModal("Too many attempts try again later");
            } else {
                window.showModal("Error: " + error.message);
            }
        }
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => signOut(auth));

    document.getElementById('postNoticeBtn')?.addEventListener('click', async () => {
        await setDoc(doc(db, "notices", assignedSociety), {
            todayMessage: document.getElementById('todayMsg').value,
            tomorrowMessage: document.getElementById('tomorrowMsg').value,
            date: new Date().toLocaleDateString('en-CA'),
            updatedAt: serverTimestamp()
        }, { merge: true });
        window.showModal("Notices updated successfully!");
    });

    document.getElementById('deleteNoticeBtn')?.addEventListener('click', async () => {
        await deleteDoc(doc(db, "notices", assignedSociety));
        document.getElementById('todayMsg').value = "";
        document.getElementById('tomorrowMsg').value = "";
        window.showModal("Notice deleted.");
    });

    window.updateFacilityName = async (fId) => {
        const newName = document.getElementById(`name_${fId}`).value.trim();
        if (!newName) return window.showModal("Please enter a name.");
        
        await setDoc(doc(db, "facilities", assignedSociety), { [fId]: newName }, { merge: true });
        window.showModal(`${fId} updated to ${newName}`);
        loadFacilitiesDropdown(); 
    }; 

    async function saveAllFacilityNames() {
        const data = {
            F1: document.getElementById('name_F1').value,
            F2: document.getElementById('name_F2').value,
            F3: document.getElementById('name_F3').value,
            F4: document.getElementById('name_F4').value,
            F5: document.getElementById('name_F5').value
        };
        
        await setDoc(doc(db, "facilities", assignedSociety), data, { merge: true });
        window.showModal("Facility names updated!");
        loadFacilitiesDropdown(); 
    }

    async function loadFacilitiesDropdown() {
        if (!assignedSociety) return;
        const fDoc = await getDoc(doc(db, "facilities", assignedSociety));
        const data = fDoc.exists() ? fDoc.data() : {};
        const select = document.getElementById('facilitySelect');
        
        select.innerHTML = "";
        ['F1', 'F2', 'F3', 'F4', 'F5'].forEach(fId => {
            const displayName = data[fId] || `Not Assigned (${fId})`;
            select.innerHTML += `<option value="${fId}">${fId}: ${displayName}</option>`;
            
            const input = document.getElementById(`name_${fId}`);
            if (input) input.value = data[fId] || "";
        });
    }

    async function loadActiveBookings() {
        if (!assignedSociety) return;
        const listContainer = document.getElementById('active-bookings-list');
        if (!listContainer) return;

        listContainer.innerHTML = "<p style='font-size: 0.9rem;'>Loading bookings...</p>";

        try {
            const fDoc = await getDoc(doc(db, "facilities", assignedSociety));
            const facilityNames = fDoc.exists() ? fDoc.data() : {};

            const q = query(collection(db, "bookings"), where("society", "==", assignedSociety));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                listContainer.innerHTML = "<p style='font-size: 0.9rem; color: #777;'>No active bookings found.</p>";
                return;
            }

            listContainer.innerHTML = "<h4>Active Bookings:</h4>";
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const facilityName = facilityNames[data.facilityId] || data.facilityId;
                
                const startTimeFormatted = data.start ? data.start.replace('T', ' ') : '';
                const endTimeFormatted = data.end ? data.end.split('T')[1] : '';

                listContainer.innerHTML += `
                    <div style="background:#f4ece0; padding:10px; margin-top:8px; border-radius:8px; font-size: 0.95rem; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <b>${facilityName}</b><br>
                            <span style="font-size: 0.85rem; color: #555;">${startTimeFormatted} to ${endTimeFormatted}</span>
                        </div>
                        <button onclick="window.deleteBooking('${docSnap.id}')" style="background:#d32f2f; font-size:0.8rem; padding:5px 10px; margin:0;">Delete</button>
                    </div>
                `;
            });
        } catch (err) {
            listContainer.innerHTML = "<p style='font-size: 0.9rem; color: red;'>Error loading bookings.</p>";
            console.error(err);
        }
    }
        
    document.getElementById('bookFacilityBtn')?.addEventListener('click', async () => {
        const fId = document.getElementById('facilitySelect').value;
        const dateInput = document.getElementById('bookingDate');
        const date = dateInput.value; 
        
        const startT = getSelectedTimeString('start'); 
        const endT = getSelectedTimeString('end');     

        if (!date || !startT || !endT) return window.showModal("Please select a date and valid start/end times.");

        const todayStr = new Date().toISOString().split('T')[0];
        const maxDate = new Date();
        maxDate.setMonth(maxDate.getMonth() + 6);
        const maxDateStr = maxDate.toISOString().split('T')[0];

        if (date < todayStr || date > maxDateStr) {
            return window.showModal("Bookings are only allowed from today up to 6 months in advance.");
        }

        try {
            await addDoc(collection(db, "bookings"), { 
                society: assignedSociety, 
                facilityId: fId, 
                start: `${date}T${startT}:00`, 
                end: `${date}T${endT}:00`       
            });
            window.showModal("Booking created successfully!");
            loadActiveBookings(); 
        } catch (err) {
            window.showModal("Failed to create booking.");
        }
    });

    window.deleteBooking = async (bookingDocId) => {
        try {
            await deleteDoc(doc(db, "bookings", bookingDocId));
            window.showModal("Booking deleted.");
            loadActiveBookings(); 
        } catch (err) {
            window.showModal("Failed to delete booking.");
        }
    };

    async function cleanupOldBookings() {
        if (!assignedSociety) return;

        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 7);
            const cutoffString = cutoffDate.toISOString().split('T')[0];

            const q = query(collection(db, "bookings"), where("society", "==", assignedSociety));
            const querySnapshot = await getDocs(q);

            const batch = writeBatch(db);
            let deleteCount = 0;

            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.start) {
                    const bookingDatePart = data.start.split('T')[0];
                    if (bookingDatePart < cutoffString) {
                        batch.delete(doc(db, "bookings", docSnap.id));
                        deleteCount++;
                    }
                }
            });

            if (deleteCount > 0) {
                await batch.commit();
            }
        } catch (err) {
            console.error("Failed to clean up old bookings:", err);
        }
    }
    document.getElementById('importBtn')?.addEventListener('click', () => {
        const file = document.getElementById('excelInput').files[0];
        if (!file) return window.showModal("Select CSV.");

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const rows = e.target.result.split('\n').slice(1);
                let addedCount = 0;
                let skippedCount = 0;

                const batch = writeBatch(db);
                let operationsCount = 0;

                for (const row of rows) {
                    const c = row.split(',');
                    if (c.length >= 2 && c[0].trim()) {
                        const vNum = c[0].trim().toUpperCase();
                        const fNum = c[1].trim();
                        const mNum = c[2] ? c[2].trim() : "";
                        const vType = c[3] ? c[3].trim() : "2-Wheeler";

                        const q = query(
                            collection(db, "vehicles"),
                            where("vehicleNumber", "==", vNum),
                            where("societyName", "==", assignedSociety)
                        );
                        const querySnapshot = await getDocs(q);

                        if (querySnapshot.empty) {
                            const newDocRef = doc(collection(db, "vehicles"));
                            batch.set(newDocRef, {
                                vehicleNumber: vNum,
                                flatNumber: fNum,
                                mobileNumber: mNum,
                                vehicleType: vType,
                                societyName: assignedSociety,
                                createdAt: serverTimestamp()
                            });
                            addedCount++;
                            operationsCount++;

                            if (operationsCount >= 450) {
                                await batch.commit();
                                operationsCount = 0;
                            }
                        } else {
                            skippedCount++;
                        }
                    }
                }

                if (operationsCount > 0) {
                    await batch.commit();
                }

                window.showModal(`Import complete! Added: ${addedCount}, Omitted (already exists): ${skippedCount}`);
            } catch (err) {
                console.error("Bulk Import Error:", err);
                window.showModal("Import failed: " + (err.message || err));
            }
        };
        reader.readAsText(file);
    });

    document.getElementById('approveAdBtn')?.addEventListener('click', async () => {
        const adKey = document.getElementById('adApprovalKey').value.trim().toUpperCase();
        await updateDoc(doc(db, "ads", adKey), { societyApproved: true });
        window.showModal("Ad Approved!");
        window.open(`https://wa.me/${teamPhone}?text=Admin of ${assignedSociety} approved Ad: ${adKey}`);
    });

    document.getElementById('exportBtn')?.addEventListener('click', async () => {
        if (!assignedSociety) return;
        try {
            const q = query(collection(db, "vehicles"), where("societyName", "==", assignedSociety));
            const snap = await getDocs(q);
            if (snap.empty) return window.showModal("No data to export.");

            let csv = "VehicleNumber,FlatNumber/Name,MobileNumber,VehicleType\n";
            snap.forEach(d => {
                const data = d.data();
                csv += `${data.vehicleNumber},${data.flatNumber},${data.mobileNumber},${data.vehicleType}\n`;
            });

            window.downloadCSV(csv, `${assignedSociety}_vehicles.csv`);
        } catch (err) {
            window.showModal("Export failed.");
        }
    });

  document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => {
        const file = document.getElementById('excelInput').files[0];
        if (!file) return window.showModal("Please select a CSV file containing vehicles to delete.");

        window.showModal("Are you sure you want to delete the vehicles listed in the uploaded CSV? This cannot be undone.", true);
        window.confirmDelete = async () => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const rows = e.target.result.split('\n').slice(1);
                    const batch = writeBatch(db);
                    let deleteCount = 0;
                    let notFoundCount = 0;
                    let operationsCount = 0;

                    for (const row of rows) {
                        const c = row.split(',');
                        if (c.length >= 1 && c[0].trim()) {
                            const vNum = c[0].trim().toUpperCase();
                            const q = query(
                                collection(db, "vehicles"),
                                where("vehicleNumber", "==", vNum),
                                where("societyName", "==", assignedSociety)
                            );
                            const snap = await getDocs(q);

                            if (!snap.empty) {
                                snap.forEach(d => {
                                    batch.delete(d.ref);
                                    deleteCount++;
                                    operationsCount++;
                                });
                            } else {
                                notFoundCount++;
                            }

                            if (operationsCount >= 450) {
                                await batch.commit();
                                operationsCount = 0;
                            }
                        }
                    }

                    if (operationsCount > 0) {
                        await batch.commit();
                    }

                    window.showModal(`Targeted Bulk Delete complete! Deleted: ${deleteCount}, Not Found: ${notFoundCount}`);
                    window.closeModal();
                    if (document.getElementById('admin-results')) document.getElementById('admin-results').innerHTML = "";
                } catch (err) {
                    console.error("Bulk Delete Error:", err);
                    window.showModal("Bulk delete failed: " + (err.message || err));
                }
            };
            reader.readAsText(file);
        };
    });
});
