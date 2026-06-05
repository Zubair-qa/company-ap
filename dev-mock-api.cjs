const http = require('http');
const { randomUUID } = require('crypto');

const PORT = Number(process.env.PORT || 4001);

const departments = [
  { id: 'dept-eng', name: 'Engineering' },
  { id: 'dept-fin', name: 'Finance' },
  { id: 'dept-proc', name: 'Procurement' },
  { id: 'dept-admin', name: 'Admin' },
];

const vendors = [
  { id: 'vendor-metro', displayName: 'Metro Repairs Pvt Ltd', kind: 'RECURRING' },
  { id: 'vendor-cloud', displayName: 'CloudHost Services', kind: 'RECURRING' },
  { id: 'vendor-prime', displayName: 'Prime Supplies Pvt Ltd', kind: 'ONE_OFF' },
];

const users = [
  { id: 'user-ap', email: 'ap@demo.local', name: 'AP Clerk', role: 'AP_CLERK', departmentId: 'dept-fin' },
  { id: 'user-fin', email: 'finance-user@demo.local', name: 'Finance User', role: 'AP_CLERK', departmentId: 'dept-fin' },
  { id: 'user-eng', email: 'eng-user@demo.local', name: 'Engineering Requester', role: 'DEPT_USER', departmentId: 'dept-eng' },
  { id: 'user-eng-admin', email: 'eng-admin@demo.local', name: 'Engineering Admin', role: 'DEPT_USER', departmentId: 'dept-eng' },
  { id: 'user-fin-admin', email: 'finance-admin@demo.local', name: 'Finance Admin', role: 'AP_CLERK', departmentId: 'dept-fin' },
  { id: 'user-cfo', email: 'cfo@demo.local', name: 'CFO', role: 'CFO', departmentId: 'dept-fin' },
  { id: 'user-admin', email: 'admin@demo.local', name: 'Company Admin', role: 'COMPANY_ADMIN', departmentId: 'dept-admin' },
  { id: 'user-proc', email: 'procurement@demo.local', name: 'Procurement Requester', role: 'DEPT_USER', departmentId: 'dept-proc' },
];

const statusLabels = {
  NEW_REQUEST: 'New request',
  DOCS_REVIEW: 'AI validated docs',
  MISSING_DOCS: 'Missing docs',
  VENDOR_PO_ACCOUNT_VERIFICATION: 'Vendor / PO / account',
  WHT_CALCULATION: 'WHT calculation',
  VOUCHER_GENERATION: 'Voucher',
  XERO_BILL_ENTRY: 'Xero bill',
  PAYMENT_PREPARATION: 'Payment prep',
  BANK_UPLOAD: 'Bank upload',
  CFO_SIGN_PENDING: 'CFO sign',
  BANK_EXECUTION_PENDING: 'Bank execution',
  BANK_EXECUTED: 'Bank executed',
  MARKED_PAID_IN_XERO: 'Paid in Xero',
  REQUESTER_NOTIFIED: 'Requester notified',
  PAYMENT_COMPLETE: 'Complete',
};

let tickets = [
  {
    id: 't1',
    title: 'Repair maintenance slip - ENG-088',
    status: 'DOCS_REVIEW',
    priority: 'HIGH',
    requesterName: 'Engineering Requester',
    department: departments[0],
    assignedTo: users[0],
    vendor: vendors[0],
    vendorNameSnapshot: 'Metro Repairs Pvt Ltd',
    invoiceNumber: 'MR-2026-118',
    internalReference: 'AP-MR-2026-118',
    amountPkr: '148500',
    paymentMethod: 'BANK_PORTAL',
    documentStatus: 'INCOMPLETE',
    missingDocuments: ['GR / receiving proof', 'Vendor bank proof'],
    dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
    expenseNature: 'REPAIR_MAINTENANCE',
    billType: 'CASH_SLIP',
    xeroSyncStatus: 'NOT_READY',
    bankPaymentStatus: 'NOT_READY',
    whtFilerStatus: 'UNKNOWN',
    statusLabel: 'AI validated docs',
    availableTransitions: ['VENDOR_PO_ACCOUNT_VERIFICATION', 'MISSING_DOCS'],
  },
  {
    id: 't2',
    title: 'Cloud hosting May invoice',
    status: 'CFO_SIGN_PENDING',
    priority: 'NORMAL',
    requesterName: 'Finance User',
    department: departments[1],
    assignedTo: users[5],
    vendor: vendors[1],
    vendorNameSnapshot: 'CloudHost Services',
    invoiceNumber: 'FIN-2026-104',
    internalReference: 'AP-FIN-2026-104',
    amountPkr: '410000',
    paymentMethod: 'BANK_PORTAL',
    documentStatus: 'COMPLETE',
    missingDocuments: [],
    dueDate: new Date(Date.now() + 1 * 86400000).toISOString(),
    expenseNature: 'SOFTWARE_CLOUD',
    billType: 'STANDARD_INVOICE',
    xeroSyncStatus: 'BILL_CREATED',
    bankPaymentStatus: 'UPLOADED',
    whtFilerStatus: 'FILER',
    statusLabel: 'CFO sign',
    availableTransitions: ['BANK_EXECUTION_PENDING'],
  },
  {
    id: 't3',
    title: 'Printer maintenance',
    status: 'PAYMENT_COMPLETE',
    priority: 'LOW',
    requesterName: 'Engineering Requester',
    department: departments[0],
    assignedTo: users[0],
    vendor: vendors[0],
    vendorNameSnapshot: 'Metro Repairs Pvt Ltd',
    invoiceNumber: 'ENG-2026-070',
    internalReference: 'AP-ENG-2026-070',
    amountPkr: '64000',
    paymentMethod: 'CHEQUE',
    documentStatus: 'COMPLETE',
    missingDocuments: [],
    dueDate: new Date(Date.now() - 4 * 86400000).toISOString(),
    expenseNature: 'REPAIR_MAINTENANCE',
    billType: 'STANDARD_INVOICE',
    xeroSyncStatus: 'PAID_MARKED',
    bankPaymentStatus: 'EXECUTED',
    whtFilerStatus: 'FILER',
    statusLabel: 'Complete',
    availableTransitions: [],
  },
];

const invoices = [
  {
    id: 'inv-1',
    reference: 'MR-2026-118',
    amountPkr: '148500',
    status: 'EXTRACTED',
    createdAt: new Date().toISOString(),
    dueDate: tickets[0].dueDate,
    description: 'Repair maintenance bill with AI validation package',
    department: departments[0],
    vendor: vendors[0],
  },
  {
    id: 'inv-2',
    reference: 'FIN-2026-104',
    amountPkr: '410000',
    status: 'APPROVED',
    createdAt: new Date().toISOString(),
    dueDate: tickets[1].dueDate,
    description: 'Cloud hosting May invoice',
    department: departments[1],
    vendor: vendors[1],
  },
  {
    id: 'inv-3',
    reference: 'PROC-2026-077',
    amountPkr: '286000',
    status: 'UPLOADED',
    createdAt: new Date().toISOString(),
    dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    description: 'Procurement supplier advance',
    department: departments[2],
    vendor: vendors[2],
  },
];

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function send(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

function tokenFor(user) {
  return Buffer.from(`${user.email}|${user.departmentId}`).toString('base64url');
}

function userFromReq(req) {
  const auth = req.headers.authorization || '';
  const raw = auth.replace(/^Bearer\s+/i, '');
  try {
    const [email] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
    return users.find((user) => user.email === email) || users[0];
  } catch {
    return users[0];
  }
}

function boardColumns() {
  const columns = [
    { id: 'docs', label: 'AI validated docs', scope: 'Department package and AI checks', statuses: ['DOCS_REVIEW'], tickets: [] },
    { id: 'finance', label: 'AP finance', scope: 'Vendor, PO, WHT and voucher', statuses: ['VENDOR_PO_ACCOUNT_VERIFICATION', 'WHT_CALCULATION', 'VOUCHER_GENERATION', 'XERO_BILL_ENTRY', 'PAYMENT_PREPARATION', 'BANK_UPLOAD'], tickets: [] },
    { id: 'cfo', label: 'CFO sign', scope: 'Mandatory payment authorization', statuses: ['CFO_SIGN_PENDING'], tickets: [] },
    { id: 'close', label: 'Payment / Xero / Close', scope: 'Bank execution, Xero paid, notify', statuses: ['BANK_EXECUTION_PENDING', 'BANK_EXECUTED', 'MARKED_PAID_IN_XERO', 'REQUESTER_NOTIFIED', 'PAYMENT_COMPLETE'], tickets: [] },
  ];
  for (const ticket of tickets) {
    const column = columns.find((item) => item.statuses.includes(ticket.status)) || columns[0];
    column.tickets.push({ ...ticket, statusLabel: statusLabels[ticket.status] || ticket.statusLabel });
  }
  return columns;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    return send(res, 204, {});
  }

  if (req.method === 'GET' && url.pathname === '/api/departments') {
    return send(res, 200, departments);
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(req);
    const user =
      users.find((item) => item.email === body.email && item.departmentId === body.departmentId) ||
      users.find((item) => item.email === body.email) ||
      users[0];
    return send(res, 200, { accessToken: tokenFor(user), user });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readBody(req);
    const user = {
      id: randomUUID(),
      email: body.email || `user-${Date.now()}@demo.local`,
      name: body.name || 'Registered User',
      role: body.role || 'DEPT_USER',
      departmentId: body.departmentId || departments[0].id,
    };
    users.push(user);
    return send(res, 200, { accessToken: tokenFor(user), user });
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    return send(res, 200, userFromReq(req));
  }

  if (req.method === 'GET' && url.pathname === '/api/tickets/board') {
    return send(res, 200, boardColumns());
  }

  if (req.method === 'GET' && url.pathname === '/api/tickets/meta') {
    return send(res, 200, {
      departments,
      vendors,
      assignees: users.filter((user) => ['AP_CLERK', 'CFO'].includes(user.role)),
      boardStatuses: Object.keys(statusLabels),
      statusLabels,
    });
  }

  const ticketMatch = url.pathname.match(/^\/api\/tickets\/([^/]+)$/);
  if (ticketMatch && req.method === 'PATCH') {
    const body = await readBody(req);
    tickets = tickets.map((ticket) =>
      ticket.id === ticketMatch[1]
        ? { ...ticket, ...body, statusLabel: statusLabels[body.status] || ticket.statusLabel }
        : ticket,
    );
    return send(res, 200, tickets.find((ticket) => ticket.id === ticketMatch[1]) || tickets[0]);
  }

  if (ticketMatch && req.method === 'GET') {
    const ticket = tickets.find((item) => item.id === ticketMatch[1]) || tickets[0];
    return send(res, 200, {
      ...ticket,
      notes: 'Mock API ticket for UI verification while Docker/Postgres is unavailable.',
      activities: [],
      attachments: [],
      childTickets: [],
      invoice: invoices.find((invoice) => invoice.reference === ticket.invoiceNumber) || null,
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/invoices') {
    return send(res, 200, invoices);
  }

  const invoiceMatch = url.pathname.match(/^\/api\/invoices\/([^/]+)$/);
  if (invoiceMatch && req.method === 'GET') {
    return send(res, 200, invoices.find((invoice) => invoice.id === invoiceMatch[1]) || invoices[0]);
  }

  if (req.method === 'GET' && url.pathname === '/api/vendors') {
    return send(res, 200, vendors);
  }

  return send(res, 404, { message: `Mock API route not implemented: ${req.method} ${url.pathname}` });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock AP API listening on http://127.0.0.1:${PORT}`);
});
