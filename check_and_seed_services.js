const API_URL = 'http://localhost:9999/api/services';

const defaultServices = [
    { name: "Internet (WiFi)", price: 100000, type: "Fixed", unit: "Phòng/Tháng" },
    { name: "Thang máy", price: 50000, type: "Fixed", unit: "Người/Tháng" },
    { name: "Vệ sinh chung (Rác)", price: 30000, type: "Fixed", unit: "Người/Tháng" },
    { name: "Gửi xe máy", price: 120000, type: "Fixed", unit: "Xe/Tháng" },
    { name: "Máy giặt chung", price: 50000, type: "Fixed", unit: "Người/Tháng" }
];

async function checkAndSeed() {
    try {
        console.log("Checking services at", API_URL);
        const res = await fetch(API_URL);
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const json = await res.json();
        const services = json.data;
        console.log(`Found ${services.length} services.`);

        if (services.length === 0) {
            console.log("No services found. Seeding defaults...");
            for (const svc of defaultServices) {
                try {
                    const createRes = await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(svc)
                    });
                    const createJson = await createRes.json();
                    if (createJson.success) {
                        console.log(`Created: ${svc.name} - ID: ${createJson.data._id}`);
                    } else {
                        console.error(`Failed to create ${svc.name}:`, createJson.message);
                    }
                } catch (createErr) {
                    console.error(`Failed to create ${svc.name}:`, createErr.message);
                }
            }
            console.log("Seeding complete.");
        } else {
            console.log("Services already exist. Skipping seed.");
            services.forEach(s => console.log(`- ${s.name} (${s._id})`));
        }

    } catch (err) {
        console.error("Error checking/seeding services:", err.message);
    }
}

checkAndSeed();
