import { db } from "./app.js";
import {
    getFirestore, doc, getDoc, collection, getDocs, addDoc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { Device } from 'https://cdn.jsdelivr.net/npm/@capacitor/device@latest/+esm';

let societyId = "";
let societyData = {};
let deviceId = "";

const modal = document.getElementById("resultModal");
function showModal(msg) {
    document.getElementById("modalMessage").innerHTML = msg;
    modal.style.display = "block";
}
window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; };

async function updateContactUsWhatsAppLink() {
    try {
        let owlWatcherTeamPhone = "919033406816";
        const configDoc = await getDoc(doc(db, "configs", "owlwatcher"));
        if (configDoc.exists()) {
            const data = configDoc.data();
            if (data.teamPhone) {
                owlWatcherTeamPhone = data.teamPhone.replace(/\D/g, '');
            }
        }
        const whatsappLinkElem = document.getElementById('adminWhatsAppLink');
        if (whatsappLinkElem) {
            whatsappLinkElem.href = `https://wa.me/${owlWatcherTeamPhone}?text=Hello%20Admin,%20I%20need%20assistance%20regarding%20my%20society%20details.`;
        }
    } catch (err) {
        console.error("Failed to fetch dynamic master admin phone, using fallback.", err);
    }
}

async function initializeEntryPage() {
    const urlParams = new URLSearchParams(window.location.search);
    societyId = urlParams.get('societyId');

    await updateContactUsWhatsAppLink();

    if (!societyId) {
        showModal("⚠️ No society selected. Redirecting...");
        setTimeout(() => window.location.href = "index.html", 2000);
        return;
    }

    // Fetch Device ID
    try {
        const info = await Device.getId();
        deviceId = info.identifier;
    } catch (err) {
        console.error("Error fetching device ID:", err);
        deviceId = localStorage.getItem('mockDeviceId') || `browser-${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('mockDeviceId', deviceId);
    }

    const socDoc = await getDoc(doc(db, "societies", societyId));
    if (socDoc.exists()) {
        societyData = socDoc.data();
        document.getElementById("societyNameLabel").innerText = societyData.name || "Unknown";

        const flatSelect = document.getElementById("flatSelect");
        if (societyData.flatList && Array.isArray(societyData.flatList)) {
            societyData.flatList.forEach(flat => {
                let opt = document.createElement("option");
                opt.value = flat;
                opt.textContent = flat;
                flatSelect.appendChild(opt);
            });
        }
    } else {
        showModal("⚠️ Society not found.");
        return;
    }

    // Check if device has prior submissions globally for this society
    await checkExistingSubmission();
}

async function checkExistingSubmission() {
    const q = query(
        collection(db, "vehicles"),
        where("deviceId", "==", deviceId),
        where("societyId", "==", societyId)
    );

    try {
        const snap = await getDocs(q);
        if (!snap.empty) {
            const firstData = snap.docs[0].data();
            const flatNumber = firstData.flatNumber;
            
            // Set flat selection and lock it down since device is tied to this flat
            const flatSelect = document.getElementById('flatSelect');
            flatSelect.value = flatNumber;
            flatSelect.disabled = true;

            document.getElementById('residentTypeSelect').value = firstData.residentType || "Owner";
            document.getElementById('residentTypeSelect').disabled = true;

            document.getElementById('mobileNumber').value = firstData.mobileNumber;
            document.getElementById('mobileNumber').disabled = true;

            const max4W = societyData.max4Wheeler !== undefined ? societyData.max4Wheeler : 1;
            const max2W = societyData.max2Wheeler !== undefined ? societyData.max2Wheeler : 2;
            const totalAllowedSlots = max4W + max2W;

            let registered4W = 0;
            let registered2W = 0;

            snap.forEach(d => {
                const v = d.data();
                if (v.vehicleType === "4-Wheeler") registered4W++;
                if (v.vehicleType === "2-Wheeler") registered2W++;
            });

            const totalRegistered = registered4W + registered2W;
            const remainingSlots = Math.max(0, totalAllowedSlots - totalRegistered);

            const container = document.getElementById("dynamicVehicleFields");
            container.innerHTML = `<h4 style="margin-bottom: 5px;">Your Registered Vehicle(s) (${totalRegistered}/${totalAllowedSlots}):</h4>`;
            snap.forEach(d => {
                const v = d.data();
                container.innerHTML += `<p style='margin: 3px 0; font-family: system-ui;'>• <b>${v.vehicleNumber}</b> (${v.vehicleType})</p>`;
            });

            if (remainingSlots === 0) {
                document.getElementById('submitBtn').disabled = true;
                document.getElementById('submitBtn').style.display = "none";
                document.getElementById('restrictionNote').style.display = "block";
                document.getElementById('restrictionNote').innerText = `✅ All allowed vehicles (${totalAllowedSlots}/${totalAllowedSlots}) have been filled for this flat from your device.`;
                document.getElementById('restrictionNote').style.color = "#27ae60";
                return true; 
            } else {
                document.getElementById('restrictionNote').style.display = "block";
                document.getElementById('restrictionNote').innerText = `ℹ️ You have filled ${totalRegistered} vehicle(s). ${remainingSlots} slot(s) remaining. You can add them below.`;
                document.getElementById('restrictionNote').style.color = "#d97706";
                
                generateRemainingInputs(flatNumber, registered4W, registered2W, max4W, max2W);
                return false; 
            }
        }
    } catch (err) {
        console.error("Error checking existing submission:", err);
    }
    return false;
}

async function generateRemainingInputs(flatNumber, registered4W, registered2W, max4W, max2W) {
    const container = document.getElementById("dynamicVehicleFields");
    const submitBtn = document.getElementById("submitBtn");

    const allowed4WInputs = Math.max(0, max4W - registered4W);
    const allowed2WInputs = Math.max(0, max2W - registered2W);

    const createVehicleInput = (type, placeholderText) => {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "dynamic-vehicle-input sans-input";
        input.dataset.type = type;
        input.placeholder = placeholderText;
        input.maxLength = 10;
        input.required = false;
        styleInput(input);
        return input;
    };

    if (allowed4WInputs > 0) {
        const title4 = document.createElement("div");
        title4.className = "section-title";
        title4.innerText = `Add Remaining Four-Wheeler(s) (${allowed4WInputs} slot(s) left)`;
        container.appendChild(title4);

        for (let i = 0; i < allowed4WInputs; i++) {
            container.appendChild(createVehicleInput("4-Wheeler", `4-Wheeler Number #${i + 1} (optional)`));
        }
    }

    if (allowed2WInputs > 0) {
        const title2 = document.createElement("div");
        title2.className = "section-title";
        title2.innerText = `Add Remaining Two-Wheeler(s) (${allowed2WInputs} slot(s) left)`;
        container.appendChild(title2);

        for (let i = 0; i < allowed2WInputs; i++) {
            container.appendChild(createVehicleInput("2-Wheeler", `2-Wheeler Number #${i + 1} (optional)`));
        }
    }

    submitBtn.style.display = "inline-block";
}

function styleInput(input) {
    input.style.width = "100%";
    input.style.fontSize = "1rem";
    input.style.padding = "10px";
    input.style.border = "2px solid #8d6e63";
    input.style.borderRadius = "10px";
    input.style.boxSizing = "border-box";
    input.style.marginBottom = "10px";
    input.style.textTransform = "uppercase";

    input.addEventListener("input", (event) => {
        event.target.value = event.target.value.toUpperCase();
    });
}

document.getElementById("flatSelect").addEventListener("change", async (e) => {
    const flatNumber = e.target.value;
    const container = document.getElementById("dynamicVehicleFields");
    const submitBtn = document.getElementById("submitBtn");
    container.innerHTML = "";
    submitBtn.style.display = "none";
    document.getElementById('restrictionNote').style.display = "none";

    if (!flatNumber) return;

    const targetSocietyName = societyData.name || societyId;
    const vehiclesRef = collection(db, "vehicles");
    
    // Check if ANY vehicles already exist for this flat in this society
    const flatQuery = query(vehiclesRef, where("societyName", "==", targetSocietyName), where("flatNumber", "==", flatNumber));
    const flatSnap = await getDocs(flatQuery);

    if (!flatSnap.empty) {
        // Check if entries belong to a DIFFERENT device ID
        let isDifferentDevice = false;
        flatSnap.forEach(docSnap => {
            if (docSnap.data().deviceId && docSnap.data().deviceId !== deviceId) {
                isDifferentDevice = true;
            }
        });

        if (isDifferentDevice) {
            container.innerHTML = `<p style="color: #d32f2f; font-weight: bold; text-align: center; font-family: system-ui, sans-serif;">⚠️ This flat has already been registered by another device. Only the original device can add or modify details for this flat.</p>`;
            e.target.value = ""; // Reset flat selection dropdown
            return;
        }
    }

    const max4W = societyData.max4Wheeler !== undefined ? societyData.max4Wheeler : 1;
    const max2W = societyData.max2Wheeler !== undefined ? societyData.max2Wheeler : 2;

    let registered4W = 0;
    let registered2W = 0;

    flatSnap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.vehicleType === "4-Wheeler") registered4W++;
        if (data.vehicleType === "2-Wheeler") registered2W++;
    });

    generateRemainingInputs(flatNumber, registered4W, registered2W, max4W, max2W);
});

document.getElementById("vehicleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const flatNumber = document.getElementById("flatSelect").value;
    const residentType = document.getElementById("residentTypeSelect").value;
    const mobileNumber = document.getElementById("mobileNumber").value.trim();
    const targetSocietyName = societyData.name || societyId;
    const vehicleInputs = document.querySelectorAll(".dynamic-vehicle-input");

    if (mobileNumber.length !== 10) {
        showModal("<p>⚠️ Mobile number must be exactly 10 digits long.</p>");
        return;
    }

    if (vehicleInputs.length === 0) {
        showModal("<p>⚠️ No vehicle slots available to register.</p>");
        return;
    }

    const filledVehicles = [];
    for (let input of vehicleInputs) {
        const vNum = input.value.trim().toUpperCase();
        if (vNum !== "") {
            if (vNum.length !== 10) {
                showModal(`<p>⚠️ All filled vehicle numbers must be exactly 10 characters long.<br><b>"${vNum}"</b> is invalid.</p>`);
                return;
            }
            filledVehicles.push({
                vehicleNumber: vNum,
                vehicleType: input.dataset.type
            });
        }
    }

    if (filledVehicles.length === 0) {
        showModal("<p>⚠️ Please enter at least one vehicle number to submit.</p>");
        return;
    }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerText = "Processing...";

    try {
        const vehiclesRef = collection(db, "vehicles");

        // Duplicate check for each filled input across the society
        for (let item of filledVehicles) {
            const q = query(vehiclesRef, where("societyName", "==", targetSocietyName), where("vehicleNumber", "==", item.vehicleNumber));
            const existingSnap = await getDocs(q);
            if (!existingSnap.empty) {
                showModal(`<p>❌ <b>Duplicate Entry</b><br>Vehicle number <b>${item.vehicleNumber}</b> is already registered.</p>`);
                btn.disabled = false;
                btn.innerText = "Submit Entry";
                return;
            }
        }

        // Final submission of filled vehicles
        for (let item of filledVehicles) {
            await addDoc(vehiclesRef, {
                societyName: targetSocietyName,
                societyId: societyId,
                flatNumber: flatNumber,
                residentType: residentType,
                vehicleNumber: item.vehicleNumber,
                mobileNumber: mobileNumber,
                vehicleType: item.vehicleType,
                deviceId: deviceId,
                timestamp: serverTimestamp()
            });
        }

        showModal("<p>✅ Vehicle(s) registered successfully!</p>");
        setTimeout(() => window.location.href = "index.html", 1500);
    } catch (err) {
        console.error(err);
        showModal("<p>❌ Error saving entries. Try again.</p>");
        btn.disabled = false;
        btn.innerText = "Submit Entry";
    }
});

// Run initialization
window.addEventListener('DOMContentLoaded', initializeEntryPage);
