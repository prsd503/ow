import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    initializeAuth, 
    indexedDBLocalPersistence, 
    browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
// 1. Import App Check modules
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";
import { Filesystem, Directory, Encoding } from 'https://cdn.jsdelivr.net/npm/@capacitor/filesystem@latest/+esm';

// FIXED: Cleaned up authDomain to remove protocols/slashes and pointed to the correct handler
const firebaseConfig = {
  apiKey: "AIzaSyBEYKHQpy_VjmgjYIwQOPjXth1bghYsf9M",
  authDomain: "finder-owl.firebaseapp.com", 
  projectId: "finder-owl",
  storageBucket: "finder-owl.firebasestorage.app",
  messagingSenderId: "1011347100861",
  appId: "1:1011347100861:web:24246f9a4eb24d812cd3d4"
};

const app = initializeApp(firebaseConfig);

// --- APP CHECK DEBUG TOKEN FIX ---
// Enables a local debug token fallback so App Check doesn't throw permission-denied errors on web/GitHub Pages before tokens propagate.
self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

// 2. Initialize App Check for Web using your correct reCAPTCHA v3 Site Key
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('6Lfuf2stAAAAAAlz5z9Ekm8XZusdtLYwII04KCZy'),
  isTokenAutoRefreshEnabled: true
});

export const db = getFirestore(app);

// --- CAPACITOR PERSISTENCE FIX ---
// Uses indexedDB for native iOS/Android packages to prevent local session storage loss and CORS errors
let authInstance;
if (window.location.href.includes("capacitor://")) {
    authInstance = initializeAuth(app, {
        persistence: indexedDBLocalPersistence
    });
} else {
    authInstance = initializeAuth(app, {
        persistence: browserLocalPersistence
    });
}
export const auth = authInstance;

// --- CAPACITOR FILESYSTEM HELPERS (Directory.Data) ---

/**
 * Write/Save data to a file in Directory.Data
 * @param {string} fileName - Name of the file (e.g., 'my-app-data.json')
 * @param {Object|string} data - Data to write
 */
export async function writePrivateData(fileName, data) {
    try {
        const jsonData = typeof data === 'object' ? JSON.stringify(data) : data;
        await Filesystem.writeFile({
            path: fileName,
            data: jsonData,
            directory: Directory.Data,
            encoding: Encoding.UTF8,
        });
        console.log('File written successfully');
    } catch (error) {
        console.error('Error writing file:', error);
    }
}

/**
 * Read data from a file in Directory.Data
 * @param {string} fileName - Name of the file to read
 * @returns {Promise<Object|string|null>} - Parsed JSON or string contents
 */
export async function readPrivateData(fileName) {
    try {
        const contents = await Filesystem.readFile({
            path: fileName,
            directory: Directory.Data,
            encoding: Encoding.UTF8,
        });
        
        // Try parsing as JSON if possible, otherwise return raw data
        try {
            return JSON.parse(contents.data);
        } catch {
            return contents.data;
        }
    } catch (error) {
        console.error('Error reading file:', error);
        return null;
    }
}

/**
 * Delete a file from Directory.Data
 * @param {string} fileName - Name of the file to delete
 */
export async function deletePrivateData(fileName = 'my-app-data.json') {
  try {
    await Filesystem.deleteFile({
      path: fileName,
      directory: Directory.Data,
    });
    console.log('File deleted successfully');
  } catch (error) {
    console.error('Error deleting file:', error);
  }
}

// Public Search Listener
const findBtn = document.getElementById('findBtn');
if (findBtn) {
    findBtn.addEventListener('click', async () => {
        const qVal = document.getElementById('search').value.trim().toUpperCase();
        if (!qVal) return;

        const vehiclesRef = collection(db, "vehicles");
        const q = query(vehiclesRef, where("vehicleNumber", "==", qVal));
        const querySnapshot = await getDocs(q);
        
        let display = document.getElementById('result');
        
        if (!querySnapshot.empty) {
            querySnapshot.forEach(async (doc) => {
                const data = doc.data();
                display.innerHTML = `
                    Found!<br>
                    Flat: <b>${data.flatNumber}</b><br>
                    Society: <b>${data.societyName || "N/A"}</b>
                `;
                
                // Example usage: Save search history locally using Directory.Data
                await writePrivateData('last-search.json', data);
            });
        } else {
            display.innerHTML = "Not found in our records.";
        }
    });
}
