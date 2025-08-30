document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const API_BASE_URL = 'http://localhost:3000/api';

    // --- STATE MANAGEMENT ---
    const state = {
        bloodtypes: [], hospitals: [], donors: [], recipients: [],
        donortransactions: [], recipienttransactions: [], inventory: []
    };

    // --- DOM ELEMENTS ---
    const mainContent = document.querySelector('.main-content');
    const loadingOverlay = document.getElementById('loading-overlay');
    const toastContainer = document.getElementById('toast-container');

    // --- API SERVICE ---
    const api = {
        async request(endpoint, method = 'GET', body = null) {
            try {
                const options = {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                };
                if (body) options.body = JSON.stringify(body);
                
                const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || `Request failed with status ${response.status}`);
                }
                return data;
            } catch (error) {
                console.error(`API Error on ${method} ${endpoint}:`, error);
                showToast(error.message, 'error');
                return null;
            }
        },
        get: (endpoint) => api.request(endpoint),
        post: (endpoint, body) => api.request(endpoint, 'POST', body),
        put: (endpoint, id, body) => api.request(`${endpoint}/${id}`, 'PUT', body),
        delete: (endpoint, id) => api.request(`${endpoint}/${id}`, 'DELETE')
    };
    
    // --- UTILITIES ---
    const showToast = (message, type = 'info') => {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type} show`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3500);
    };
    const showLoading = (show) => loadingOverlay.classList.toggle('hidden', !show);
    const formatDate = (dateString) => dateString ? new Date(dateString).toISOString().split('T')[0] : '';
    const getRelationName = (id, collection, idField, nameField) => state[collection].find(c => c[idField] === id)?.[nameField] || 'N/A';
    
    // --- RENDER DEFINITIONS ---
    const sections = {
        inventory: {
            render: () => {
                const tableBody = document.querySelector('#inventory-table tbody');
                if (!tableBody) return;
                tableBody.innerHTML = state.inventory.map(item => `
                    <tr>
                        <td>${item.Blood_Type_ID}</td>
                        <td>${item.Name}</td>
                        <td>${item.Units_in_Stock}</td>
                        <td><span class="status-badge status-${item.Status}">${item.Status}</span></td>
                    </tr>`).join('') || `<tr><td colspan="4" class="text-center">No inventory data.</td></tr>`;
            }
        },
        bloodtype: { endpoint: 'bloodtypes', idField: 'Blood_Type_ID', columns: [{ key: 'Blood_Type_ID' }, { key: 'Name' }] },
        hospital: { endpoint: 'hospitals', idField: 'Hospital_ID', columns: [{ key: 'Hospital_ID' }, { key: 'Name' }, { key: 'Address' }, { key: 'Contact_Number' }] },
        donor: { endpoint: 'donors', idField: 'Donor_ID', columns: [{ key: 'Donor_ID' }, { key: 'Name' }, { key: 'Contact_Number' }, { key: 'Age' }, { key: 'Blood_Type_ID', render: item => getRelationName(item.Blood_Type_ID, 'bloodtypes', 'Blood_Type_ID', 'Name') }, { key: 'Donor_Card_ID' }] },
        recipient: { endpoint: 'recipients', idField: 'Recipient_ID', columns: [{ key: 'Recipient_ID' }, { key: 'Name' }, { key: 'Contact_Number' }, { key: 'Blood_Type_ID', render: item => getRelationName(item.Blood_Type_ID, 'bloodtypes', 'Blood_Type_ID', 'Name') }, { key: 'Donor_ID', render: item => getRelationName(item.Donor_ID, 'donors', 'Donor_ID', 'Name') }] },
        donortransaction: { endpoint: 'donortransactions', idField: 'Donor_Trans_ID', columns: [{ key: 'Donor_Trans_ID' }, { key: 'Donor_ID', render: item => getRelationName(item.Donor_ID, 'donors', 'Donor_ID', 'Name') }, { key: 'Hospital_ID', render: item => getRelationName(item.Hospital_ID, 'hospitals', 'Hospital_ID', 'Name') }, { key: 'Date', render: item => formatDate(item.Date) }] },
        recipienttransaction: { endpoint: 'recipienttransactions', idField: 'Recipient_Trans_ID', columns: [{ key: 'Recipient_Trans_ID' }, { key: 'Recipient_ID', render: item => getRelationName(item.Recipient_ID, 'recipients', 'Recipient_ID', 'Name') }, { key: 'Hospital_ID', render: item => getRelationName(item.Hospital_ID, 'hospitals', 'Hospital_ID', 'Name') }, { key: 'Blood_Type_ID', render: item => getRelationName(item.Blood_Type_ID, 'bloodtypes', 'Blood_Type_ID', 'Name') }, { key: 'Date', render: item => formatDate(item.Date) }] }
    };

    const renderTable = (sectionName, data, columns, idField) => {
        const tableBody = document.querySelector(`#${sectionName}-table tbody`);
        if (!tableBody) return;
        tableBody.innerHTML = !data || data.length === 0 
            ? `<tr><td colspan="${columns.length + 1}" class="text-center">No data available.</td></tr>`
            : data.map(item => `
                <tr data-id="${item[idField]}">
                    ${columns.map(col => `<td>${col.render ? col.render(item) : item[col.key] ?? 'N/A'}</td>`).join('')}
                    <td class="action-cell">
                        <button class="btn btn-edit" data-id="${item[idField]}"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn btn-delete" data-id="${item[idField]}"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>
            `).join('');
    };
    
    // --- MAIN APP LOGIC ---
    const init = async () => {
        showLoading(true);
        const dataPromises = Object.values(sections)
            .filter(s => s.endpoint)
            .map(s => api.get(`/${s.endpoint}`).then(data => state[s.endpoint] = data || []));
        
        await Promise.all(dataPromises);
        await reloadInventory();

        Object.entries(sections).forEach(([name, config]) => {
            if (config.endpoint) renderTable(name, state[config.endpoint], config.columns, config.idField);
        });
        
        updateDashboard();
        populateAllDropdowns();
        showLoading(false);
    };

    const reloadInventory = async () => {
        state.inventory = await api.get('/inventory') || [];
        sections.inventory.render();
    };

    const updateDashboard = () => {
        document.getElementById('total-donors').textContent = state.donors.length;
        document.getElementById('total-recipients').textContent = state.recipients.length;
        document.getElementById('total-hospitals').textContent = state.hospitals.length;
        document.getElementById('total-blood-types').textContent = state.bloodtypes.length;
    };

    const populateDropdown = (selector, data, valueField, nameField, defaultText) => {
        document.querySelectorAll(selector).forEach(select => {
            const currentValue = select.value;
            select.innerHTML = `<option value="">-- ${defaultText} --</option>`;
            data.forEach(item => select.add(new Option(`${item[nameField]} (${item[valueField]})`, item[valueField])));
            select.value = currentValue;
        });
    };

    const populateAllDropdowns = () => {
        populateDropdown('#donor-blood-type, #recipient-blood-type, #recipient-trans-blood-type', state.bloodtypes, 'Blood_Type_ID', 'Name', 'Select Blood Type');
        populateDropdown('#recipient-donor-id, #donor-trans-donor', state.donors, 'Donor_ID', 'Name', 'Select Donor');
        populateDropdown('#donor-trans-hospital, #recipient-trans-hospital', state.hospitals, 'Hospital_ID', 'Name', 'Select Hospital');
        populateDropdown('#recipient-trans-recipient', state.recipients, 'Recipient_ID', 'Name', 'Select Recipient');
    };

    // --- EVENT LISTENERS ---
    mainContent.addEventListener('click', async e => {
        const button = e.target.closest('button');
        if (!button) return;

        const sectionEl = button.closest('.content-section');
        const sectionName = sectionEl?.dataset.section;
        const section = sections[sectionName];
        if (!section) return;

        const form = document.getElementById(`${sectionName}-form`);
        
        if (button.classList.contains('btn-add')) {
            form.reset();
            form.querySelector('.edit-id').value = '';
            form.querySelector(`[name="${section.idField}"]`).readOnly = false;
            form.classList.remove('hidden');
        } else if (button.classList.contains('cancel-btn')) {
            form.classList.add('hidden');
        } else if (button.classList.contains('btn-edit')) {
            const id = button.dataset.id;
            const item = state[section.endpoint].find(d => d[section.idField] == id);
            form.reset();
            form.querySelector('.edit-id').value = id;
            Object.keys(item).forEach(key => {
                const input = form.querySelector(`[name="${key}"]`);
                if (input) input.value = input.type === 'date' ? formatDate(item[key]) : item[key];
            });
            form.querySelector(`[name="${section.idField}"]`).readOnly = true;
            form.classList.remove('hidden');
        } else if (button.classList.contains('btn-delete')) {
            const id = button.dataset.id;
            if (confirm(`Delete ${sectionName} with ID ${id}? This cannot be undone.`)) {
                showLoading(true);
                const result = await api.delete(`/${section.endpoint}`, id);
                if (result) {
                    showToast(result.message, 'success');
                    await init();
                }
                showLoading(false);
            }
        }
    });

    document.querySelectorAll('.data-form').forEach(form => {
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const sectionName = form.id.replace('-form', '');
            const section = sections[sectionName];
            if (!section) return;

            const id = form.querySelector('.edit-id').value;
            const body = Object.fromEntries(new FormData(form));

            showLoading(true);
            const result = id 
                ? await api.put(`/${section.endpoint}`, id, body) 
                : await api.post(`/${section.endpoint}`, body);
            
            if (result) {
                showToast(result.message, 'success');
                form.classList.add('hidden');
                await init();
            }
            showLoading(false);
        });
    });

    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.sidebar-nav a').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active-section'));
            document.getElementById(link.dataset.target)?.classList.add('active-section');
        });
    });

    init(); // Start the application
});