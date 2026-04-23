import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.0';

// Setup Supabase
const supabaseUrl = 'https://kmmbimiqkfqsxpqcovun.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttbWJpbWlxa2Zxc3hwcWNvdnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTY3NDAsImV4cCI6MjA5MjUzMjc0MH0.nuTAxNkBT42u9IB2RxYXPxXa27UnLpBwMV8A-RwF4BM';
const supabase = createClient(supabaseUrl, supabaseKey);

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const appContainer = document.getElementById('appContainer');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');

const form = document.getElementById('ideaForm');
const submitBtn = document.getElementById('submitBtn');
const statusMsg = document.getElementById('statusMsg');
const modal = document.getElementById('ideaModal');
const closeBtn = document.querySelector('.close-btn');

let allIdeas = []; 

// --- NEW: LOGIN LOGIC ---
loginBtn.addEventListener('click', async () => {
    const pwd = document.getElementById('teamPassword').value;
    loginBtn.disabled = true;
    loginBtn.innerText = "Checking...";
    
    // We hardcode the dummy email here, but check the user's typed password
    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'team@mybrainstorm.com', // Replace with the dummy email you created in Step 2
        password: pwd
    });

    if (error) {
        loginError.innerText = "Incorrect Password!";
        loginBtn.disabled = false;
        loginBtn.innerText = "Unlock App";
    } else {
        // Success! Hide login, show app, and load the data.
        loginScreen.style.display = 'none';
        appContainer.style.display = 'flex';
        loadGraph();
    }
});
// -------------------------

// Math for comparing AI Vectors
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Handle Form Submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    
    const name = document.getElementById('authorName').value;
    const title = document.getElementById('ideaTitle').value;
    const desc = document.getElementById('ideaDesc').value;

    statusMsg.innerText = "Loading AI to analyze idea...";

    try {
        const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        const textToEmbed = title + ". " + desc;
        const output = await extractor(textToEmbed, { pooling: 'mean', normalize: true });
        const embeddingArray = Array.from(output.data);

        statusMsg.innerText = "Saving to database...";

        const { error } = await supabase.from('ideas').insert([
            { name: name, title: title, description: desc, embedding: embeddingArray }
        ]);

        if (error) throw error;

        statusMsg.innerText = "Idea added successfully!";
        form.reset();
        loadGraph(); 

    } catch (err) {
        console.error(err);
        statusMsg.innerText = "Error: " + err.message;
    } finally {
        submitBtn.disabled = false;
        setTimeout(() => statusMsg.innerText = "", 3000);
    }
});

// Draw the Graph
async function loadGraph() {
    const { data, error } = await supabase.from('ideas').select('*');
    if (error) {
        console.error("Failed to load ideas:", error);
        return;
    }
    
    allIdeas = data;
    const nodes = [];
    const edges = [];

    allIdeas.forEach(idea => {
        nodes.push({ id: idea.id, label: idea.title, shape: 'dot', size: 20 });
    });

    for (let i = 0; i < allIdeas.length; i++) {
        for (let j = i + 1; j < allIdeas.length; j++) {
            const similarity = cosineSimilarity(allIdeas[i].embedding, allIdeas[j].embedding);
            if (similarity > 0.65) {
                edges.push({ from: allIdeas[i].id, to: allIdeas[j].id });
            }
        }
    }

    const container = document.getElementById('mynetwork');
    const graphData = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
    const options = { physics: { stabilization: false } };
    
    const network = new vis.Network(container, graphData, options);

    network.on("click", function (params) {
        if (params.nodes.length > 0) {
            const clickedNodeId = params.nodes[0];
            const idea = allIdeas.find(i => i.id === clickedNodeId);
            
            document.getElementById('modalTitle').innerText = idea.title;
            document.getElementById('modalAuthor').innerText = idea.name;
            document.getElementById('modalDesc').innerText = idea.description;
            
            modal.style.display = "block";
        }
    });
}

// Close Modal Logic
closeBtn.onclick = () => modal.style.display = "none";
window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; }