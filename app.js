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
const modalViewMode = document.getElementById('modalViewMode');
const modalEditMode = document.getElementById('modalEditMode');

const contextMenu = document.getElementById('contextMenu');
const contextEditBtn = document.getElementById('contextEditBtn');
const contextDeleteBtn = document.getElementById('contextDeleteBtn');

let allIdeas = []; 
let network = null;
let selectedContextNodeId = null;

// --- LOGIN LOGIC ---
loginBtn.addEventListener('click', async () => {
    const pwd = document.getElementById('teamPassword').value;
    loginBtn.disabled = true;
    loginBtn.innerText = "Checking...";
    
    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'team@mybrainstorm.com', 
        password: pwd
    });

    if (error) {
        loginError.innerText = "Incorrect Password!";
        loginBtn.disabled = false;
        loginBtn.innerText = "Unlock App";
    } else {
        loginScreen.style.display = 'none';
        appContainer.classList.remove('hidden');
        loadGraph();
    }
});

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

    // Modern Styling for Nodes
    allIdeas.forEach(idea => {
        nodes.push({ 
            id: idea.id, 
            label: idea.title, 
            shape: 'dot', 
            size: 25,
            color: {
                background: '#38bdf8',
                border: '#0ea5e9',
                highlight: { background: '#f8fafc', border: '#38bdf8' },
                hover: { background: '#7dd3fc', border: '#0ea5e9' }
            },
            font: { color: '#f8fafc', face: 'Outfit', size: 16 }
        });
    });

    // Calculate Average Similarity
    let totalSimilarity = 0;
    let pairCount = 0;
    let pairs = [];

    for (let i = 0; i < allIdeas.length; i++) {
        for (let j = i + 1; j < allIdeas.length; j++) {
            const similarity = cosineSimilarity(allIdeas[i].embedding, allIdeas[j].embedding);
            pairs.push({ from: allIdeas[i].id, to: allIdeas[j].id, similarity });
            totalSimilarity += similarity;
            pairCount++;
        }
    }

    const avgSimilarity = pairCount > 0 ? (totalSimilarity / pairCount) : 0;
    console.log(`Computed Average Similarity: ${avgSimilarity.toFixed(4)}`);

    // Connect if above average
    pairs.forEach(pair => {
        if (pair.similarity > avgSimilarity) {
            edges.push({ 
                from: pair.from, 
                to: pair.to, 
                color: { color: 'rgba(56, 189, 248, 0.4)', highlight: '#38bdf8' },
                width: 2
            });
        }
    });

    const container = document.getElementById('mynetwork');
    const graphData = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
    const options = { 
        physics: { stabilization: false, barnesHut: { springLength: 200 } },
        interaction: { hover: true }
    };
    
    if (network) network.destroy();
    network = new vis.Network(container, graphData, options);

    // Context Menu Event
    network.on("oncontext", function (params) {
        params.event.preventDefault();
        const nodeId = this.getNodeAt(params.pointer.DOM);
        if (nodeId) {
            selectedContextNodeId = nodeId;
            contextMenu.style.left = params.event.clientX + 'px';
            contextMenu.style.top = params.event.clientY + 'px';
            contextMenu.classList.remove('hidden');
        }
    });

    // Click Event
    network.on("click", function (params) {
        contextMenu.classList.add('hidden'); // Hide context menu

        if (params.nodes.length > 0) {
            const clickedNodeId = params.nodes[0];
            openViewModal(clickedNodeId);
        }
    });

    network.on("dragStart", function () {
        contextMenu.classList.add('hidden');
    });
}

function openViewModal(nodeId) {
    const idea = allIdeas.find(i => i.id === nodeId);
    if (!idea) return;

    modalViewMode.classList.remove('hidden');
    modalEditMode.classList.add('hidden');

    document.getElementById('modalTitle').innerText = idea.title;
    document.getElementById('modalAuthor').innerText = idea.name;
    document.getElementById('modalDesc').innerText = idea.description;
    
    modal.classList.remove('hidden');
}

function openEditModal(nodeId) {
    const idea = allIdeas.find(i => i.id === nodeId);
    if (!idea) return;

    modalViewMode.classList.add('hidden');
    modalEditMode.classList.remove('hidden');

    document.getElementById('editIdeaId').value = idea.id;
    document.getElementById('editAuthorName').value = idea.name;
    document.getElementById('editIdeaTitle').value = idea.title;
    document.getElementById('editIdeaDesc').value = idea.description;

    modal.classList.remove('hidden');
}

// Context Menu Actions
contextEditBtn.addEventListener('click', () => {
    contextMenu.classList.add('hidden');
    if (selectedContextNodeId) openEditModal(selectedContextNodeId);
});

contextDeleteBtn.addEventListener('click', async () => {
    contextMenu.classList.add('hidden');
    if (confirm("Are you sure you want to remove this idea? This cannot be undone.")) {
        const { error } = await supabase.from('ideas').delete().eq('id', selectedContextNodeId);
        if (!error) {
            loadGraph();
        } else {
            console.error("Failed to delete", error);
            alert("Error deleting idea.");
        }
    }
});

// Edit Save Logic
document.getElementById('saveEditBtn').addEventListener('click', async () => {
    const saveBtn = document.getElementById('saveEditBtn');
    const msg = document.getElementById('editStatusMsg');
    
    const id = document.getElementById('editIdeaId').value;
    const name = document.getElementById('editAuthorName').value;
    const title = document.getElementById('editIdeaTitle').value;
    const desc = document.getElementById('editIdeaDesc').value;

    saveBtn.disabled = true;
    msg.innerText = "Re-analyzing updated idea...";

    try {
        const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        const textToEmbed = title + ". " + desc;
        const output = await extractor(textToEmbed, { pooling: 'mean', normalize: true });
        const embeddingArray = Array.from(output.data);

        msg.innerText = "Updating database...";

        const { error } = await supabase.from('ideas').update({
            name: name,
            title: title,
            description: desc,
            embedding: embeddingArray
        }).eq('id', id);

        if (error) throw error;

        msg.innerText = "Successfully updated!";
        setTimeout(() => {
            modal.classList.add('hidden');
            msg.innerText = "";
            loadGraph();
        }, 1000);

    } catch (err) {
        console.error(err);
        msg.innerText = "Error: " + err.message;
    } finally {
        saveBtn.disabled = false;
    }
});

document.getElementById('cancelEditBtn').addEventListener('click', () => {
    modal.classList.add('hidden');
});

// Close Modal Logic
closeBtn.onclick = () => modal.classList.add('hidden');
window.onclick = (e) => { 
    if (e.target == modal) modal.classList.add('hidden'); 
    if (!contextMenu.contains(e.target) && e.target.tagName !== 'CANVAS') {
        contextMenu.classList.add('hidden');
    }
};