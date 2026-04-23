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
const closeBtn = document.getElementById('closeModalBtn');
const modalViewMode = document.getElementById('modalViewMode');
const modalEditMode = document.getElementById('modalEditMode');

// Modal action buttons
const modalEditBtn = document.getElementById('modalEditBtn');
const modalDeleteBtn = document.getElementById('modalDeleteBtn');
const saveEditBtn = document.getElementById('saveEditBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const exportBtn = document.getElementById('exportBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const fitViewBtn = document.getElementById('fitViewBtn');
const gatherBtn = document.getElementById('gatherBtn');
const modalUpvoteBtn = document.getElementById('modalUpvoteBtn');
const modalDownvoteBtn = document.getElementById('modalDownvoteBtn');
const modalVotesDisplay = document.getElementById('modalVotesDisplay');
const darkModeToggle = document.getElementById('darkModeToggle');
const infoBtn = document.getElementById('infoBtn');

const infoModal = document.getElementById('infoModal');
const closeInfoBtn = document.getElementById('closeInfoBtn');
const dismissInfoBtn = document.getElementById('dismissInfoBtn');

const addCommentBtn = document.getElementById('addCommentBtn');
const newCommentInput = document.getElementById('newCommentInput');
const commentsList = document.getElementById('commentsList');

let allIdeas = []; 
let network = null;
let currentViewedNodeId = null; 

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
        loginBtn.innerText = "Enter Workspace";
    } else {
        loginScreen.style.display = 'none';
        appContainer.classList.remove('hidden');
        loadGraph();

        if (!localStorage.getItem('hasSeenInvite')) {
            infoModal.classList.remove('hidden');
            localStorage.setItem('hasSeenInvite', 'true');
        }
    }
});

// Info Modal Controls
infoBtn.addEventListener('click', () => infoModal.classList.remove('hidden'));
closeInfoBtn.addEventListener('click', () => infoModal.classList.add('hidden'));
dismissInfoBtn.addEventListener('click', () => infoModal.classList.add('hidden'));

// Math for comparing AI Vectors
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function getColorFromName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 80%, 85%)`; 
}

function getDarkColorFromName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 60%, 25%)`; 
}

// Node Size Calculator
function getNodeSize(votes, downvotes) {
    const score = (votes || 0) - (downvotes || 0);
    return {
        font: Math.max(10, 14 + (score * 1.5)),
        margin: Math.max(8, 14 + score)
    };
}

// Handle Form Submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerText = "Processing...";
    
    const name = document.getElementById('authorName').value;
    const title = document.getElementById('ideaTitle').value;
    const desc = document.getElementById('ideaDesc').value;
    const tags = document.getElementById('ideaTags').value || '';

    statusMsg.innerText = "Analyzing idea concept...";

    try {
        const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        const textToEmbed = title + ". " + desc + ". " + tags;
        const output = await extractor(textToEmbed, { pooling: 'mean', normalize: true });
        const embeddingArray = Array.from(output.data);

        statusMsg.innerText = "Saving to workspace...";

        const { error } = await supabase.from('ideas').insert([
            { name: name, title: title, description: desc, tags: tags, embedding: embeddingArray }
        ]);

        if (error) throw error;

        statusMsg.innerText = "Successfully added!";
        form.reset();
        loadGraph(); 

    } catch (err) {
        console.error(err);
        statusMsg.innerText = "Error: " + err.message;
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Add to Graph";
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

    // Styling for Nodes
    allIdeas.forEach(idea => {
        const authorColor = isDarkMode ? getDarkColorFromName(idea.name || "Unknown") : getColorFromName(idea.name || "Unknown");
        const size = getNodeSize(idea.votes, idea.downvotes);
        nodes.push({ 
            id: idea.id, 
            label: idea.title, 
            shape: 'box',
            borderWidth: 2,
            color: {
                background: authorColor,
                border: '#e5e7eb',
                highlight: { background: authorColor, border: '#111827' },
                hover: { background: authorColor, border: '#9ca3af' }
            },
            font: { color: isDarkMode ? '#f9fafb' : '#111827', face: 'Inter', size: size.font, multi: true },
            margin: size.margin,
            shadow: {
                enabled: true,
                color: 'rgba(0,0,0,0.08)',
                size: 6,
                x: 0,
                y: 3
            }
        });
    });

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

    // Connect if above average + Opacity/Width Scaling
    pairs.forEach(pair => {
        if (pair.similarity > avgSimilarity) {
            // Scale thickness from 1 to 5 based on similarity distance past average
            const edgeWeight = 1 + (pair.similarity - avgSimilarity) * 10;
            const edgeOpacity = Math.min(1, 0.3 + (pair.similarity - avgSimilarity) * 2);
            edges.push({ 
                from: pair.from, 
                to: pair.to, 
                color: { 
                    color: isDarkMode ? `rgba(249, 250, 251, ${edgeOpacity})` : `rgba(28, 30, 33, ${edgeOpacity})`, 
                    highlight: isDarkMode ? '#f9fafb' : '#111827' 
                },
                width: edgeWeight,
                smooth: { type: 'continuous' }
            });
        }
    });

    const container = document.getElementById('mynetwork');
    const graphData = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
    const options = { 
        physics: { 
            solver: 'repulsion',
            repulsion: {
                nodeDistance: 250,
                springLength: 200,
                springConstant: 0.05
            },
            stabilization: { enabled: true, iterations: 200 }
        },
        interaction: { hover: true, tooltipDelay: 200 }
    };
    
    if (network) network.destroy();
    network = new vis.Network(container, graphData, options);

    network.on("stabilizationIterationsDone", function () {
        network.setOptions({ physics: { enabled: false } });
        network.fit({ padding: 50, animation: { duration: 800 } });
    });

    network.on("click", function (params) {
        if (params.nodes.length > 0) {
            const clickedNodeId = params.nodes[0];
            openViewModal(clickedNodeId);
        }
    });
}

function renderComments(idea) {
    commentsList.innerHTML = '';
    const comments = idea.comments || [];
    if (comments.length === 0) {
        commentsList.innerHTML = '<span style="color:var(--text-secondary)">No comments yet.</span>';
        return;
    }
    comments.forEach(c => {
        const div = document.createElement('div');
        div.style.marginBottom = '0.5rem';
        div.style.borderBottom = '1px solid var(--border-color)';
        div.style.paddingBottom = '0.25rem';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        
        div.innerHTML = `<div><strong>${c.user}</strong>: ${c.text}</div>
                         <button class="delete-comment-btn" data-id="${c.id || c.text}" style="background:none; border:none; color: var(--danger-color); cursor:pointer;" title="Delete Comment">🗑️</button>`;
        commentsList.appendChild(div);
    });

    const delBtns = commentsList.querySelectorAll('.delete-comment-btn');
    delBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const commentIdToDelete = e.currentTarget.getAttribute('data-id');
            // Fallback for old comments without ID
            const newCommentList = idea.comments.filter(c => (c.id || c.text) !== commentIdToDelete);
            
            idea.comments = newCommentList;
            renderComments(idea);
            
            try {
                await supabase.from('ideas').update({ comments: newCommentList }).eq('id', idea.id);
            } catch(err) { console.error(err); }
        });
    });
}

function openViewModal(nodeId) {
    const idea = allIdeas.find(i => i.id === nodeId);
    if (!idea) return;

    currentViewedNodeId = nodeId;

    modalViewMode.classList.remove('hidden');
    modalEditMode.classList.add('hidden');

    document.getElementById('modalTitle').innerText = idea.title;
    document.getElementById('modalAuthor').innerText = idea.name;
    document.getElementById('modalDesc').innerText = idea.description;
    
    document.getElementById('modalTagsDisplay').innerText = idea.tags || 'No Tags';
    
    const score = (idea.votes || 0) - (idea.downvotes || 0);
    modalVotesDisplay.innerText = `${score >= 0 ? '+' : ''}${score} Votes`;
    
    renderComments(idea);

    document.getElementById('editStatusMsg').innerText = "";
    modal.classList.remove('hidden');
}

function openEditMode() {
    const idea = allIdeas.find(i => i.id === currentViewedNodeId);
    if (!idea) return;

    modalViewMode.classList.add('hidden');
    modalEditMode.classList.remove('hidden');

    document.getElementById('editIdeaId').value = idea.id;
    document.getElementById('editAuthorName').value = idea.name;
    document.getElementById('editIdeaTitle').value = idea.title;
    document.getElementById('editIdeaDesc').value = idea.description;
    document.getElementById('editIdeaTags').value = idea.tags || '';
}

// Comments Logic
addCommentBtn.addEventListener('click', async () => {
    if (!currentViewedNodeId) return;
    const txt = newCommentInput.value.trim();
    const user = document.getElementById('newCommenterName').value.trim() || "Anonymous";
    if (!txt) return;

    const idea = allIdeas.find(i => i.id === currentViewedNodeId);
    const existingComments = idea.comments || [];
    const commentId = Date.now().toString() + Math.random().toString().slice(2, 6);
    const newCommentList = [...existingComments, { id: commentId, user: user, text: txt }];

    addCommentBtn.innerText = '...';
    try {
        await supabase.from('ideas').update({ comments: newCommentList }).eq('id', currentViewedNodeId);
        idea.comments = newCommentList;
        newCommentInput.value = '';
        renderComments(idea);
    } catch(e) { console.error(e); }
    addCommentBtn.innerText = 'Post';
});

// Delete
modalDeleteBtn.addEventListener('click', async () => {
    if (!currentViewedNodeId) return;
    if (confirm("Are you sure you want to delete this idea? This action cannot be undone.")) {
        const oldText = modalDeleteBtn.innerText;
        modalDeleteBtn.innerText = "Deleting...";
        modalDeleteBtn.disabled = true;

        const { error } = await supabase.from('ideas').delete().eq('id', currentViewedNodeId);
        
        modalDeleteBtn.innerText = oldText;
        modalDeleteBtn.disabled = false;

        if (!error) {
            modal.classList.add('hidden');
            loadGraph();
        } else {
            console.error("Failed to delete", error);
            alert("Error deleting idea: " + error.message);
        }
    }
});

// Edit
modalEditBtn.addEventListener('click', openEditMode);

// Save Edit
saveEditBtn.addEventListener('click', async () => {
    const msg = document.getElementById('editStatusMsg');
    
    const id = document.getElementById('editIdeaId').value;
    const name = document.getElementById('editAuthorName').value;
    const title = document.getElementById('editIdeaTitle').value;
    const desc = document.getElementById('editIdeaDesc').value;
    const tags = document.getElementById('editIdeaTags').value;

    saveEditBtn.disabled = true;
    saveEditBtn.innerText = "Saving...";
    msg.innerText = "Re-analyzing idea...";

    try {
        const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        const textToEmbed = title + ". " + desc + ". " + tags;
        const output = await extractor(textToEmbed, { pooling: 'mean', normalize: true });
        const embeddingArray = Array.from(output.data);

        msg.innerText = "Updating workspace...";

        const { error } = await supabase.from('ideas').update({
            name: name,
            title: title,
            description: desc,
            tags: tags,
            embedding: embeddingArray
        }).eq('id', id);

        if (error) throw error;

        msg.innerText = "Update successful!";
        setTimeout(() => {
            msg.innerText = "";
            modal.classList.add('hidden');
            loadGraph();
        }, 800);

    } catch (err) {
        console.error(err);
        msg.innerText = "Error: " + err.message;
        msg.className = "error-msg";
    } finally {
        saveEditBtn.disabled = false;
        saveEditBtn.innerText = "Save Changes";
    }
});

cancelEditBtn.addEventListener('click', () => {
    openViewModal(currentViewedNodeId);
});

closeBtn.onclick = () => modal.classList.add('hidden');
window.onclick = (e) => { 
    if (e.target === modal) modal.classList.add('hidden'); 
};

// Search Filter (Semantic!)
searchBtn.addEventListener('click', async () => {
    if (!network) return;
    const term = searchInput.value.trim();
    
    if (!term) {
        // Reset hiding
        const updateNodes = allIdeas.map(idea => ({ id: idea.id, hidden: false }));
        network.body.data.nodes.update(updateNodes);
        return;
    }

    searchBtn.innerText = "🔍...";
    searchBtn.disabled = true;

    try {
        const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        const output = await extractor(term, { pooling: 'mean', normalize: true });
        const searchVec = Array.from(output.data);

        const updateNodes = [];
        allIdeas.forEach(idea => {
            const sim = cosineSimilarity(searchVec, idea.embedding);
            // Hide nodes with low similarity to the query
            updateNodes.push({ id: idea.id, hidden: sim < 0.25 }); 
        });
        network.body.data.nodes.update(updateNodes);
    } catch(e) {
        console.error("Semantic search failed", e);
    }
    
    searchBtn.innerText = "🔍";
    searchBtn.disabled = false;
});

// Allow enter key inside search
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchBtn.click();
});

// Canvas Controls (Fix Animation Interferences)
zoomInBtn.addEventListener('click', () => {
    if (network) {
        const currentScale = network.getScale();
        network.moveTo({ scale: currentScale * 1.5, animation: { duration: 300 } });
    }
});

zoomOutBtn.addEventListener('click', () => {
    if (network) {
        const currentScale = network.getScale();
        network.moveTo({ scale: currentScale / 1.5, animation: { duration: 300 } });
    }
});

fitViewBtn.addEventListener('click', () => {
    if (network) network.fit({ animation: { duration: 500 } });
});

// Gather Nodes Automatically
gatherBtn.addEventListener('click', () => {
    if (!network) return;
    network.setOptions({ physics: { enabled: true } });
    network.stabilize(100);
});

// Export Graph as Image
exportBtn.addEventListener('click', () => {
    const canvas = document.querySelector('.vis-network canvas'); // More robust selector
    if (canvas) {
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Brainstorming_Graph.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } else {
        alert("Canvas not loaded yet!");
    }
});

// Export Database as CSV
exportCsvBtn.addEventListener('click', () => {
    if (!allIdeas || allIdeas.length === 0) {
        alert("No data to export!");
        return;
    }

    const headers = ['ID', 'Creator Name', 'Idea Title', 'Description', 'Tags', 'Upvotes', 'Downvotes', 'Net Score', 'Comments Count'];
    
    const escapeCsv = (str) => {
        if (str == null) return '""';
        return `"${String(str).replace(/"/g, '""')}"`;
    };

    const csvRows = [headers.join(',')];

    allIdeas.forEach(idea => {
        const row = [
            idea.id,
            escapeCsv(idea.name),
            escapeCsv(idea.title),
            escapeCsv(idea.description),
            escapeCsv(idea.tags),
            idea.votes || 0,
            idea.downvotes || 0,
            (idea.votes || 0) - (idea.downvotes || 0),
            idea.comments ? idea.comments.length : 0
        ];
        csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Brainstorming_Database.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// Voting Logic
async function castVote(isUpvote) {
    if (!currentViewedNodeId) return;
    const idea = allIdeas.find(i => i.id === currentViewedNodeId);
    
    let newUp = idea.votes || 0;
    let newDown = idea.downvotes || 0;
    
    if (isUpvote) newUp += 1;
    else newDown += 1;
    
    const updatePayload = { votes: newUp, downvotes: newDown };
    
    modalUpvoteBtn.disabled = true;
    modalDownvoteBtn.disabled = true;

    const { error } = await supabase.from('ideas').update(updatePayload).eq('id', currentViewedNodeId);
    
    modalUpvoteBtn.disabled = false;
    modalDownvoteBtn.disabled = false;

    if (!error) {
        idea.votes = newUp;
        idea.downvotes = newDown;
        const score = newUp - newDown;
        modalVotesDisplay.innerText = `${score >= 0 ? '+' : ''}${score} Votes`;
        
        if (network) {
            const size = getNodeSize(newUp, newDown);
            network.body.data.nodes.update([{ 
                id: currentViewedNodeId, 
                font: { size: size.font },
                margin: size.margin
            }]);
        }
    } else {
        console.error("Failed to vote", error);
        alert("Error voting. Please try again.");
    }
}

modalUpvoteBtn.addEventListener('click', () => castVote(true));
modalDownvoteBtn.addEventListener('click', () => castVote(false));

// Dark mode toggle
let isDarkMode = false;
darkModeToggle.addEventListener('click', () => {
    isDarkMode = document.body.classList.toggle('dark-mode');
    if (network) {
        // Update nodes safely preserving font sizes
        const nodeUpdates = network.body.data.nodes.get().map(node => {
            const idea = allIdeas.find(i => i.id === node.id);
            const bg = isDarkMode ? getDarkColorFromName(idea?.name || "Unknown") : getColorFromName(idea?.name || "Unknown");
            return {
                id: node.id,
                color: {
                    background: bg,
                    highlight: { background: bg },
                    hover: { background: bg }
                },
                font: Object.assign({}, node.font, { color: isDarkMode ? '#f9fafb' : '#111827' })
            };
        });
        network.body.data.nodes.update(nodeUpdates);

        // Update edges correctly
        const edgeUpdates = network.body.data.edges.get().map(edge => {
            const currentRgba = (edge.color && edge.color.color) ? edge.color.color : '';
            let newColor = currentRgba;
            if (isDarkMode) {
                newColor = currentRgba.replace('28, 30, 33', '249, 250, 251');
            } else {
                newColor = currentRgba.replace('249, 250, 251', '28, 30, 33');
            }
            return {
                id: edge.id,
                color: { color: newColor, highlight: isDarkMode ? '#f9fafb' : '#111827' }
            };
        });
        network.body.data.edges.update(edgeUpdates);
    }
});