const http = require('http');

const departments = [
  { id: 'admin', name: 'Admin' },
  { id: 'eng', name: 'Engineering' },
  { id: 'fin', name: 'Finance' },
];

const users = [
  {
    id: 'u-ap',
    email: 'ap@demo.local',
    name: 'AP Clerk',
    role: 'AP_CLERK',
    departmentId: 'fin',
  },
  {
    id: 'u-admin',
    email: 'admin@demo.local',
    name: 'Company Admin',
    role: 'COMPANY_ADMIN',
    departmentId: 'admin',
  },
  {
    id: 'u-cfo',
    email: 'cfo@demo.local',
    name: 'CFO',
    role: 'CFO',
    departmentId: 'fin',
  },
  {
    id: 'u-eng',
    email: 'eng-user@demo.local',
    name: 'Engineering Requester',
    role: 'DEPT_USER',
    departmentId: 'eng',
  },
  {
    id: 'u-eng-head',
    email: 'eng-admin@demo.local',
    name: 'Engineering Department Head',
    role: 'DEPT_ADMIN',
    departmentId: 'eng',
  },
  {
    id: 'u-fin',
    email: 'finance-user@demo.local',
    name: 'Finance Requester',
    role: 'DEPT_USER',
    departmentId: 'fin',
  },
  {
    id: 'u-fin-head',
    email: 'finance-admin@demo.local',
    name: 'Finance Department Head',
    role: 'DEPT_ADMIN',
    departmentId: 'fin',
  },
];

const vendors = [
  { id: 'v1', displayName: 'CloudHost Ltd', kind: 'RECURRING' },
  { id: 'v2', displayName: 'Ad-hoc Consultant', kind: 'ONE_OFF' },
];

const boardStatuses = [
  'NEW_REQUEST',
  'DEPARTMENT_HEAD_APPROVAL',
  'DOCS_REVIEW',
  'MISSING_DOCS',
  'REQUESTER_PINGED',
  'WAITING_FOR_DOCS',
  'VENDOR_PO_ACCOUNT_VERIFICATION',
  'WHT_CALCULATION',
  'VOUCHER_GENERATION',
  'XERO_BILL_ENTRY',
  'PAYMENT_PREPARATION',
  'BANK_UPLOAD',
  'CFO_SIGN_PENDING',
  'BANK_EXECUTION_PENDING',
  'BANK_EXECUTED',
  'MARKED_PAID_IN_XERO',
  'REQUESTER_NOTIFIED',
  'PAYMENT_COMPLETE',
];

const statusLabels = {
  NEW_REQUEST: 'Invoice / PO submitted',
  DEPARTMENT_HEAD_APPROVAL: 'Department head approval',
  DOCS_REVIEW: 'Finance document review',
  MISSING_DOCS: 'Missing documents',
  REQUESTER_PINGED: 'Requester pinged',
  WAITING_FOR_DOCS: 'Waiting for documents',
  VENDOR_PO_ACCOUNT_VERIFICATION: 'Vendor / PO / account verification',
  WHT_CALCULATION: 'WHT filer/non-filer calculation',
  VOUCHER_GENERATION: 'Voucher generation',
  XERO_BILL_ENTRY: 'Xero bill entry',
  PAYMENT_PREPARATION: 'Payment preparation',
  BANK_UPLOAD: 'Bank upload',
  CFO_SIGN_PENDING: 'CFO sign pending',
  BANK_EXECUTION_PENDING: 'Bank execution pending',
  BANK_EXECUTED: 'Bank executed',
  MARKED_PAID_IN_XERO: 'Marked paid in Xero',
  REQUESTER_NOTIFIED: 'Requester notified',
  PAYMENT_COMPLETE: 'Payment complete',
};

const boardColumns = [
  {
    id: 'submission',
    label: 'Department draft / rework',
    scope: 'Department creates invoice and fixes rejected requests.',
    statuses: ['NEW_REQUEST'],
  },
  {
    id: 'department_head_approval',
    label: 'Department head approval',
    scope: 'Department head reviews read-only request and approves or rejects.',
    statuses: ['DEPARTMENT_HEAD_APPROVAL'],
  },
  {
    id: 'department_verification',
    label: 'Department verification',
    scope: 'Finance reviews documents; missing docs go back to requester.',
    statuses: ['DOCS_REVIEW', 'MISSING_DOCS', 'REQUESTER_PINGED', 'WAITING_FOR_DOCS'],
  },
  {
    id: 'data_verification',
    label: 'Data verification',
    scope: 'Vendor, PO, account number, old sheet reference, and invoice data are checked.',
    statuses: ['VENDOR_PO_ACCOUNT_VERIFICATION'],
  },
  {
    id: 'tax_voucher',
    label: 'WHT and voucher',
    scope: 'Filer/non-filer WHT is calculated and payment voucher is generated.',
    statuses: ['WHT_CALCULATION', 'VOUCHER_GENERATION'],
  },
  {
    id: 'xero_bookkeeping',
    label: 'Xero bookkeeping',
    scope: 'AP bill is entered/synced to Xero before payment processing.',
    statuses: ['XERO_BILL_ENTRY'],
  },
  {
    id: 'payment_disbursement',
    label: 'Payment disbursement',
    scope: 'Payment file is prepared, uploaded to Meezan, signed by CFO, and executed.',
    statuses: [
      'PAYMENT_PREPARATION',
      'BANK_UPLOAD',
      'CFO_SIGN_PENDING',
      'BANK_EXECUTION_PENDING',
      'BANK_EXECUTED',
    ],
  },
  {
    id: 'reconciliation',
    label: 'Reconciliation and close',
    scope: 'Payment is marked paid in Xero, requester is notified, and ticket is closed.',
    statuses: ['MARKED_PAID_IN_XERO', 'REQUESTER_NOTIFIED', 'PAYMENT_COMPLETE'],
  },
];

const transitions = {
  NEW_REQUEST: ['DEPARTMENT_HEAD_APPROVAL'],
  DEPARTMENT_HEAD_APPROVAL: ['NEW_REQUEST', 'DOCS_REVIEW'],
  DOCS_REVIEW: ['MISSING_DOCS', 'VENDOR_PO_ACCOUNT_VERIFICATION'],
  MISSING_DOCS: ['REQUESTER_PINGED'],
  REQUESTER_PINGED: ['WAITING_FOR_DOCS'],
  WAITING_FOR_DOCS: ['DOCS_REVIEW'],
  VENDOR_PO_ACCOUNT_VERIFICATION: ['WHT_CALCULATION'],
  WHT_CALCULATION: ['VOUCHER_GENERATION'],
  VOUCHER_GENERATION: ['XERO_BILL_ENTRY'],
  XERO_BILL_ENTRY: ['PAYMENT_PREPARATION'],
  PAYMENT_PREPARATION: ['BANK_UPLOAD'],
  BANK_UPLOAD: ['CFO_SIGN_PENDING'],
  CFO_SIGN_PENDING: ['BANK_EXECUTION_PENDING'],
  BANK_EXECUTION_PENDING: ['BANK_EXECUTED'],
  BANK_EXECUTED: ['MARKED_PAID_IN_XERO'],
  MARKED_PAID_IN_XERO: ['REQUESTER_NOTIFIED'],
  REQUESTER_NOTIFIED: ['PAYMENT_COMPLETE'],
  PAYMENT_COMPLETE: [],
};

const roleTransitions = {
  DEPT_USER: {
    NEW_REQUEST: ['DEPARTMENT_HEAD_APPROVAL'],
    WAITING_FOR_DOCS: ['DOCS_REVIEW'],
  },
  DEPT_ADMIN: {},
  AP_CLERK: {
    DOCS_REVIEW: ['MISSING_DOCS', 'VENDOR_PO_ACCOUNT_VERIFICATION'],
    MISSING_DOCS: ['REQUESTER_PINGED'],
    REQUESTER_PINGED: ['WAITING_FOR_DOCS'],
    WAITING_FOR_DOCS: ['DOCS_REVIEW'],
    VENDOR_PO_ACCOUNT_VERIFICATION: ['WHT_CALCULATION'],
    WHT_CALCULATION: ['VOUCHER_GENERATION'],
    VOUCHER_GENERATION: ['XERO_BILL_ENTRY'],
    XERO_BILL_ENTRY: ['PAYMENT_PREPARATION'],
    PAYMENT_PREPARATION: ['BANK_UPLOAD'],
    BANK_UPLOAD: ['CFO_SIGN_PENDING'],
    BANK_EXECUTED: ['MARKED_PAID_IN_XERO'],
    MARKED_PAID_IN_XERO: ['REQUESTER_NOTIFIED'],
    REQUESTER_NOTIFIED: ['PAYMENT_COMPLETE'],
  },
  COMPANY_ADMIN: transitions,
  CFO: {
    CFO_SIGN_PENDING: ['BANK_EXECUTION_PENDING'],
  },
};

const allTicketUpdateFields = [
  'title',
  'status',
  'priority',
  'requesterName',
  'requesterEmail',
  'departmentId',
  'assignedToId',
  'vendorId',
  'vendorNameSnapshot',
  'purchaseOrderNumber',
  'purchaseOrderRequired',
  'purchaseOrderVerified',
  'invoiceNumber',
  'internalReference',
  'amountPkr',
  'paymentMethod',
  'vendorAccountNumber',
  'invoiceAccountNumber',
  'accountVerificationStatus',
  'accountVerificationSource',
  'documentStatus',
  'missingDocuments',
  'expenseNature',
  'billType',
  'xeroSyncStatus',
  'xeroContactId',
  'xeroBillId',
  'xeroBillNumber',
  'xeroPaymentId',
  'whtFilerStatus',
  'whtRate',
  'voucherNumber',
  'bankPaymentStatus',
  'bankPortalReference',
  'trelloCardId',
  'trelloUrl',
  'legacySheetRowId',
  'legacySheetName',
  'oldReference',
  'parentTicketId',
  'invoiceId',
  'notes',
  'submittedToFinanceAt',
  'dueDate',
];

const apStageFields = {
  DOCS_REVIEW: ['status', 'assignedToId', 'documentStatus', 'missingDocuments', 'notes'],
  MISSING_DOCS: ['status', 'assignedToId', 'documentStatus', 'missingDocuments', 'notes'],
  REQUESTER_PINGED: ['status', 'assignedToId', 'documentStatus', 'missingDocuments', 'notes'],
  WAITING_FOR_DOCS: ['status', 'assignedToId', 'documentStatus', 'missingDocuments', 'notes'],
  VENDOR_PO_ACCOUNT_VERIFICATION: [
    'status',
    'assignedToId',
    'vendorId',
    'vendorNameSnapshot',
    'purchaseOrderNumber',
    'purchaseOrderRequired',
    'purchaseOrderVerified',
    'invoiceNumber',
    'internalReference',
    'amountPkr',
    'paymentMethod',
    'expenseNature',
    'billType',
    'vendorAccountNumber',
    'invoiceAccountNumber',
    'accountVerificationStatus',
    'accountVerificationSource',
    'notes',
  ],
  WHT_CALCULATION: ['status', 'assignedToId', 'whtFilerStatus', 'whtRate', 'notes'],
  VOUCHER_GENERATION: ['status', 'assignedToId', 'voucherNumber', 'notes'],
  XERO_BILL_ENTRY: [
    'status',
    'assignedToId',
    'xeroSyncStatus',
    'xeroContactId',
    'xeroBillId',
    'xeroBillNumber',
    'xeroPaymentId',
    'notes',
  ],
  PAYMENT_PREPARATION: [
    'status',
    'assignedToId',
    'paymentMethod',
    'bankPaymentStatus',
    'bankPortalReference',
    'notes',
  ],
  BANK_UPLOAD: [
    'status',
    'assignedToId',
    'bankPaymentStatus',
    'bankPortalReference',
    'notes',
  ],
  CFO_SIGN_PENDING: ['status', 'assignedToId', 'notes'],
  BANK_EXECUTION_PENDING: ['status', 'bankPaymentStatus', 'bankPortalReference', 'notes'],
  BANK_EXECUTED: ['status', 'xeroSyncStatus', 'xeroPaymentId', 'notes'],
  MARKED_PAID_IN_XERO: ['status', 'notes'],
  REQUESTER_NOTIFIED: ['status', 'notes'],
};

const departmentStageFields = {
  NEW_REQUEST: [
    'status',
    'title',
    'priority',
    'requesterName',
    'requesterEmail',
    'vendorId',
    'vendorNameSnapshot',
    'purchaseOrderNumber',
    'invoiceNumber',
    'internalReference',
    'amountPkr',
    'paymentMethod',
    'expenseNature',
    'billType',
    'notes',
  ],
  WAITING_FOR_DOCS: [
    'status',
    'title',
    'requesterName',
    'requesterEmail',
    'vendorNameSnapshot',
    'purchaseOrderNumber',
    'invoiceNumber',
    'internalReference',
    'amountPkr',
    'paymentMethod',
    'expenseNature',
    'billType',
    'notes',
  ],
};

const cfoStageFields = {
  CFO_SIGN_PENDING: ['status', 'bankPaymentStatus', 'bankPortalReference', 'notes'],
};

const dueDate = new Date(Date.now() + 2 * 86400000).toISOString();
const submittedToFinanceAt = new Date().toISOString();

let tickets = [
  {
    id: 't1',
    title: 'FIN-2026-104 - CloudHost monthly hosting',
    status: 'CFO_SIGN_PENDING',
    priority: 'HIGH',
    departmentId: 'fin',
    department: departments[2],
    assignedToId: 'u-cfo',
    assignedTo: users[2],
    vendorId: 'v1',
    vendor: vendors[0],
    vendorNameSnapshot: 'CloudHost Ltd',
    amountPkr: '185000',
    paymentMethod: 'BANK_PORTAL',
    documentStatus: 'COMPLETE',
    missingDocuments: [],
    dueDate,
    expenseNature: 'SOFTWARE_CLOUD',
    billType: 'STANDARD_INVOICE',
    xeroSyncStatus: 'BILL_CREATED',
    bankPaymentStatus: 'UPLOADED',
    whtFilerStatus: 'FILER',
    invoiceNumber: 'FIN-2026-104',
    internalReference: 'AP-FIN-0001',
    requesterName: 'Finance requester',
    requesterEmail: 'requester.finance@demo.local',
    purchaseOrderNumber: 'PO-FIN-104',
    purchaseOrderRequired: true,
    purchaseOrderVerified: true,
    vendorAccountNumber: 'PK12MEZN0000000012345678',
    invoiceAccountNumber: 'PK12MEZN0000000012345678',
    accountVerificationStatus: 'MATCHED',
    accountVerificationSource: 'Invoice matched vendor master',
    submittedToFinanceAt,
    xeroContactId: 'xero-contact-cloudhost',
    xeroBillId: 'xero-bill-fin-104',
    xeroBillNumber: 'XBILL-FIN-104',
    xeroPaymentId: null,
    whtRate: '4.5',
    whtAmountPkr: '8325',
    netPayablePkr: '176675',
    voucherNumber: 'VCH-2026-0519-001',
    bankPortalReference: 'MZN-UP-8821',
    trelloCardId: 'trello-fin-104',
    trelloUrl: 'https://trello.example/cards/fin-104',
    legacySheetRowId: '42',
    legacySheetName: 'AP Tracker V2',
    oldReference: 'GS-FIN-104',
    parentTicketId: null,
    notes: 'Awaiting CFO sign in Meezan bank portal.',
    childTickets: [],
    activities: [],
  },
  {
    id: 't2',
    title: 'Admin repair maintenance bill - docs missing',
    status: 'MISSING_DOCS',
    priority: 'URGENT',
    departmentId: 'admin',
    department: departments[0],
    assignedToId: 'u-ap',
    assignedTo: users[0],
    vendorId: null,
    vendor: null,
    vendorNameSnapshot: 'Office Pro Services',
    amountPkr: '62000',
    paymentMethod: 'CHEQUE',
    documentStatus: 'INCOMPLETE',
    missingDocuments: ['Purchase order', 'Vendor account proof'],
    dueDate,
    expenseNature: 'REPAIR_MAINTENANCE',
    billType: 'CASH_SLIP',
    xeroSyncStatus: 'NOT_READY',
    bankPaymentStatus: 'NOT_READY',
    whtFilerStatus: 'UNKNOWN',
    invoiceNumber: 'ADM-2026-014',
    internalReference: 'AP-ADM-0002',
    requesterName: 'Admin requester',
    requesterEmail: 'requester.admin@demo.local',
    purchaseOrderNumber: null,
    purchaseOrderRequired: true,
    purchaseOrderVerified: false,
    vendorAccountNumber: null,
    invoiceAccountNumber: null,
    accountVerificationStatus: 'NEEDS_MANUAL_REVIEW',
    accountVerificationSource:
      'Invoice does not show account number; verify from old Excel sheet',
    submittedToFinanceAt,
    xeroContactId: null,
    xeroBillId: null,
    xeroBillNumber: null,
    xeroPaymentId: null,
    whtRate: null,
    whtAmountPkr: null,
    netPayablePkr: '62000',
    voucherNumber: null,
    bankPortalReference: null,
    trelloCardId: 'trello-adm-014',
    trelloUrl: 'https://trello.example/cards/adm-014',
    legacySheetRowId: '77',
    legacySheetName: 'Old AP Sheet',
    oldReference: 'OLD-ADM-014',
    parentTicketId: null,
    notes: 'Requester pinged for missing repair maintenance documents.',
    childTickets: [],
    activities: [],
  },
  {
    id: 't3',
    title: 'ENG-2026-088 - CloudHost 50% advance paid',
    status: 'PAYMENT_COMPLETE',
    priority: 'NORMAL',
    departmentId: 'eng',
    department: departments[1],
    assignedToId: 'u-ap',
    assignedTo: users[0],
    vendorId: 'v1',
    vendor: vendors[0],
    vendorNameSnapshot: 'CloudHost Ltd',
    amountPkr: '212500',
    paymentMethod: 'BANK_PORTAL',
    documentStatus: 'COMPLETE',
    missingDocuments: [],
    dueDate: new Date(Date.now() - 86400000).toISOString(),
    expenseNature: 'SOFTWARE_CLOUD',
    billType: 'ADVANCE_PARTIAL',
    xeroSyncStatus: 'PAID_MARKED',
    bankPaymentStatus: 'EXECUTED',
    whtFilerStatus: 'FILER',
    invoiceNumber: 'ENG-2026-088',
    internalReference: 'AP-ENG-0003',
    requesterName: 'Engineering requester',
    requesterEmail: 'requester.eng@demo.local',
    purchaseOrderNumber: 'PO-ENG-088',
    purchaseOrderRequired: true,
    purchaseOrderVerified: true,
    vendorAccountNumber: 'PK12MEZN0000000012345678',
    invoiceAccountNumber: 'PK12MEZN0000000012345678',
    accountVerificationStatus: 'MATCHED',
    accountVerificationSource: 'Verified from vendor master and old AP tracker',
    submittedToFinanceAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    xeroContactId: 'xero-contact-cloudhost',
    xeroBillId: 'xero-bill-eng-088',
    xeroBillNumber: 'XBILL-ENG-088',
    xeroPaymentId: 'xero-payment-eng-088',
    whtRate: '4.5',
    whtAmountPkr: '9563',
    netPayablePkr: '202937',
    voucherNumber: 'VCH-2026-0518-004',
    bankPortalReference: 'MZN-EX-9902',
    trelloCardId: 'trello-eng-088',
    trelloUrl: 'https://trello.example/cards/eng-088',
    legacySheetRowId: '88',
    legacySheetName: 'AP Tracker V2',
    oldReference: 'GS-ENG-088-P1',
    parentTicketId: null,
    notes: 'Closed audit record. Remaining 50% should be raised as a linked new ticket.',
    childTickets: [],
    activities: [],
  },
];

let ticketAttachments = [
  {
    id: 'att-1',
    ticketId: 't1',
    fileName: 'FIN-2026-104-invoice.pdf',
    mimeType: 'application/pdf',
    fileSize: '184000',
    documentType: 'INVOICE',
    uploadedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    uploadedBy: users[0],
    content: 'Demo attachment for FIN-2026-104 invoice.',
  },
  {
    id: 'att-2',
    ticketId: 't2',
    fileName: 'repair-maintenance-slip.jpg',
    mimeType: 'image/jpeg',
    fileSize: '92000',
    documentType: 'RECEIPT',
    uploadedAt: new Date(Date.now() - 3600000).toISOString(),
    uploadedBy: users[4],
    content: 'Demo attachment for repair maintenance slip.',
  },
  {
    id: 'att-3',
    ticketId: 't3',
    fileName: 'bank-execution-confirmation.pdf',
    mimeType: 'application/pdf',
    fileSize: '110000',
    documentType: 'OTHER',
    uploadedAt: new Date(Date.now() - 86400000).toISOString(),
    uploadedBy: users[0],
    content: 'Demo attachment for closed bank execution confirmation.',
  },
];

let invoices = [];
let purchaseOrders = [
  {
    id: 'po-1',
    poNumber: 'PO-FIN-104',
    status: 'APPROVED',
    totalAmount: '185000',
    vendor: vendors[0],
    department: departments[2],
  },
  {
    id: 'po-2',
    poNumber: 'PO-ENG-088',
    status: 'OPEN',
    totalAmount: '425000',
    vendor: vendors[0],
    department: departments[1],
  },
];
let approvalRules = [
  {
    id: 'rule-1',
    minAmount: '0',
    maxAmount: '100000',
    requiredRole: 'DEPT_ADMIN',
    approvalLevel: 1,
    department: null,
  },
  {
    id: 'rule-2',
    minAmount: '100001',
    maxAmount: '999999999',
    requiredRole: 'COMPANY_ADMIN',
    approvalLevel: 2,
    department: departments[2],
  },
];
let queries = [
  {
    id: 'q-1',
    queryText: 'Vendor account number missing on repair maintenance bill',
    status: 'OPEN',
    raisedAt: new Date(Date.now() - 3600000).toISOString(),
    assignedToDepartmentId: 'admin',
    assignedToDepartment: departments[0],
  },
  {
    id: 'q-2',
    queryText: 'Need PO confirmation for remaining 50% payment',
    status: 'RESPONDED',
    raisedAt: new Date(Date.now() - 86400000).toISOString(),
    assignedToDepartmentId: 'eng',
    assignedToDepartment: departments[1],
  },
];
let paymentBatches = [
  {
    id: 'pb-1',
    batchNumber: 'PB-DEMO-001',
    status: 'EXPORTED',
    totalCount: 1,
    totalAmount: '176675',
    payments: [
      {
        paymentRef: 'PAY-DEMO-001',
        beneficiaryName: 'CloudHost Ltd',
        iban: 'PK12MEZN0000000012345678',
        bank: 'Meezan Bank',
        amount: '176675',
        currency: 'PKR',
        valueDate: new Date().toISOString().slice(0, 10),
        narration: 'FIN-2026-104 CloudHost monthly hosting',
      },
    ],
  },
];
let xeroConnections = [
  {
    id: 'xero-demo',
    tenantName: 'Demo Company',
    tenantId: 'tenant-demo',
    active: true,
    expiresAt: new Date(Date.now() + 1800 * 1000).toISOString(),
  },
];
const taxCodes = [
  { id: 'tax-1', code: 'WHT-FILER-4.5', name: 'Withholding tax filer', rate: '4.5', type: 'WITHHOLDING' },
  { id: 'tax-2', code: 'WHT-NON-FILER-10', name: 'Withholding tax non filer', rate: '10', type: 'WITHHOLDING' },
];
const glAccounts = [
  { id: 'gl-1', accountCode: '500', accountName: 'Operating expenses', accountType: 'EXPENSE' },
  { id: 'gl-2', accountCode: '520', accountName: 'Repair and maintenance', accountType: 'EXPENSE' },
];

function send(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function currentUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return users.find((user) => `demo-${user.id}` === token) || users[0];
}

function hydrate(ticket) {
  const user = hydrate.currentUser || users[0];
  const allowed = roleTransitions[user.role]?.[ticket.status] || [];
  const invoice = ticket.invoiceId ? invoices.find((item) => item.id === ticket.invoiceId) : null;
  return {
    ...ticket,
    department: departments.find((department) => department.id === ticket.departmentId),
    vendor: vendors.find((vendor) => vendor.id === ticket.vendorId) || null,
    assignedTo: users.find((user) => user.id === ticket.assignedToId) || null,
    invoice: invoice ? hydrateInvoice(invoice) : null,
    statusLabel: statusLabels[ticket.status] || ticket.status,
    availableTransitions: allowed.filter((status) => transitions[ticket.status]?.includes(status)),
    canAssign: user.role === 'COMPANY_ADMIN' || user.role === 'AP_CLERK',
    childTickets: tickets
      .filter((child) => child.parentTicketId === ticket.id)
      .map((child) => ({
        id: child.id,
        title: child.title,
        amountPkr: child.amountPkr,
        status: child.status,
      })),
  };
}

function visibleTickets(user) {
  if (user.role === 'CFO') {
    return tickets.filter(
      (ticket) => ticket.status === 'CFO_SIGN_PENDING' || ticket.assignedToId === user.id,
    );
  }
  const financeStatuses = new Set(
    boardStatuses.filter((status) => !['NEW_REQUEST', 'DEPARTMENT_HEAD_APPROVAL'].includes(status)),
  );
  if (user.role === 'AP_CLERK') return tickets.filter((ticket) => financeStatuses.has(ticket.status));
  if (user.role === 'DEPT_USER') {
    return tickets.filter(
      (ticket) =>
        ticket.departmentId === user.departmentId &&
        ['NEW_REQUEST', 'DEPARTMENT_HEAD_APPROVAL'].includes(ticket.status),
    );
  }
  if (user.role === 'DEPT_ADMIN') {
    return tickets.filter(
      (ticket) =>
        ticket.departmentId === user.departmentId &&
        ticket.status === 'DEPARTMENT_HEAD_APPROVAL',
    );
  }
  return tickets;
}

function visibleInvoices(user) {
  const scoped =
    !['DEPT_USER', 'DEPT_ADMIN'].includes(user.role)
      ? invoices
      : invoices.filter(
          (invoice) => (invoice.departmentId || invoice.department?.id) === user.departmentId,
        );
  return scoped
    .filter((invoice) => user.role !== 'DEPT_ADMIN' || invoice.status === 'AWAITING_APPROVAL')
    .map(hydrateInvoice);
}

function hydrateInvoice(invoice) {
  const department =
    invoice.department ||
    departments.find((item) => item.id === invoice.departmentId) ||
    null;
  const vendor =
    invoice.vendor ||
    vendors.find((item) => item.id === invoice.vendorId) ||
    null;
  const purchaseOrder =
    purchaseOrders.find((item) => item.id === invoice.poId || item.invoiceId === invoice.id) ||
    invoice.purchaseOrder ||
    null;

  return {
    invoiceNumber: null,
    description: null,
    invoiceDate: null,
    receivedDate: null,
    dueDate: null,
    currency: 'PKR',
    subtotal: String(invoice.amountPkr ?? '0'),
    taxAmount: '0',
    withholdingTax: '0',
    totalAmount: String(invoice.amountPkr ?? '0'),
    extracted: {},
    departmentId: department?.id || invoice.departmentId || null,
    vendorId: vendor?.id || invoice.vendorId || null,
    poId: purchaseOrder?.id || invoice.poId || null,
    submittedBy: invoice.submittedBy || null,
    ...invoice,
    amountPkr: String(invoice.amountPkr ?? '0'),
    department,
    vendor,
    purchaseOrder,
  };
}

function findVisibleInvoice(id, user) {
  return visibleInvoices(user).find((invoice) => invoice.id === id);
}

function createDraftInvoiceForRequest(id, user) {
  if (!/^inv-\d+/.test(id)) return null;
  const departmentId = ['DEPT_USER', 'DEPT_ADMIN'].includes(user.role) ? user.departmentId : user.departmentId || 'eng';
  const department = departments.find((item) => item.id === departmentId) || departments[1];
  const invoice = {
    id,
    invoiceNumber: null,
    reference: 'Uploaded invoice draft',
    amountPkr: '0',
    status: 'EXTRACTED',
    description: null,
    invoiceDate: null,
    receivedDate: null,
    dueDate: null,
    currency: 'PKR',
    subtotal: '0',
    taxAmount: '0',
    withholdingTax: '0',
    totalAmount: '0',
    extracted: {
      note: 'Recovered demo draft after mock API restart. Complete the invoice details and save.',
    },
    departmentId: department.id,
    vendorId: null,
    department,
    vendor: null,
    originalFilename: 'uploaded-invoice',
    mimeType: 'application/octet-stream',
    submittedBy: user,
  };
  invoices.unshift(invoice);
  ensureInvoicePurchaseOrder(invoice, user);
  return hydrateInvoice(invoice);
}

function findOrCreateVisibleInvoice(id, user) {
  return findVisibleInvoice(id, user) || createDraftInvoiceForRequest(id, user);
}

function upsertDepartmentTicketFromInvoice(invoice, user) {
  const inv = hydrateInvoice(invoice);
  const index = tickets.findIndex((ticket) => ticket.invoiceId === inv.id);
  const title = inv.invoiceNumber || inv.reference || inv.description || 'Department invoice';
  const base = {
    ...tickets[0],
    id: index >= 0 ? tickets[index].id : `t-${Date.now()}`,
    title,
    status: 'NEW_REQUEST',
    priority: 'NORMAL',
    departmentId: inv.departmentId,
    assignedToId: null,
    vendorId: inv.vendorId,
    vendor: inv.vendor,
    vendorNameSnapshot: inv.vendor?.displayName || null,
    amountPkr: String(inv.amountPkr || 0),
    paymentMethod: 'BANK_PORTAL',
    documentStatus: 'PENDING_REVIEW',
    missingDocuments: [],
    dueDate: inv.dueDate || null,
    expenseNature: 'OTHER',
    billType: inv.mimeType?.startsWith('image/') ? 'CASH_SLIP' : 'STANDARD_INVOICE',
    xeroSyncStatus: 'NOT_READY',
    bankPaymentStatus: 'NOT_READY',
    whtFilerStatus: 'UNKNOWN',
    invoiceNumber: inv.invoiceNumber || inv.reference,
    internalReference: `AP-${String(inv.id).slice(-6)}`,
    requesterName: user.name,
    requesterEmail: user.email,
    purchaseOrderNumber: inv.purchaseOrder?.poNumber || null,
    purchaseOrderRequired: true,
    purchaseOrderVerified: false,
    submittedToFinanceAt: null,
    notes: inv.description || inv.reference || 'Department draft awaiting completion',
    invoiceId: inv.id,
    childTickets: [],
    activities: index >= 0 ? tickets[index].activities || [] : [],
  };
  if (index >= 0) {
    if (!['NEW_REQUEST', 'DEPARTMENT_HEAD_APPROVAL'].includes(tickets[index].status)) return;
    tickets[index] = { ...tickets[index], ...base, id: tickets[index].id };
  } else {
    tickets.unshift(base);
  }
}

function syncTicketFromInvoice(invoice) {
  const inv = hydrateInvoice(invoice);
  const index = tickets.findIndex((ticket) => ticket.invoiceId === inv.id);
  if (index < 0) return;
  const title =
    inv.invoiceNumber ||
    inv.reference ||
    inv.description ||
    `${inv.department?.name || 'Department'} invoice`;
  tickets[index] = {
    ...tickets[index],
    title,
    invoiceNumber: inv.invoiceNumber || inv.reference || tickets[index].invoiceNumber,
    purchaseOrderNumber: inv.purchaseOrder?.poNumber || tickets[index].purchaseOrderNumber,
    purchaseOrderVerified: inv.purchaseOrder?.status === 'APPROVED' || tickets[index].purchaseOrderVerified,
    amountPkr: String(inv.amountPkr || tickets[index].amountPkr || 0),
    netPayablePkr: String(inv.amountPkr || tickets[index].netPayablePkr || 0),
    dueDate: inv.dueDate || tickets[index].dueDate,
    vendorId: inv.vendorId,
    vendor: inv.vendor,
    vendorNameSnapshot: inv.vendor?.displayName || tickets[index].vendorNameSnapshot,
    notes: inv.description || tickets[index].notes,
  };
}

function ensureInvoicePurchaseOrder(invoice, user) {
  const inv = hydrateInvoice(invoice);
  const department = inv.department || departments.find((item) => item.id === inv.departmentId);
  const vendor = inv.vendor || vendors.find((item) => item.id === inv.vendorId) || null;
  const amount = String(Number(inv.totalAmount || inv.amountPkr || 0));
  const existingIndex = purchaseOrders.findIndex(
    (item) => item.id === inv.poId || item.invoiceId === inv.id,
  );
  const po = {
    id: existingIndex >= 0 ? purchaseOrders[existingIndex].id : `po-${Date.now()}`,
    invoiceId: inv.id,
    poNumber:
      existingIndex >= 0
        ? purchaseOrders[existingIndex].poNumber
        : `PO-${String(inv.id).slice(-8).toUpperCase()}`,
    status: existingIndex >= 0 ? purchaseOrders[existingIndex].status : 'DRAFT',
    poDate: inv.invoiceDate || new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: inv.dueDate || null,
    currency: inv.currency || 'PKR',
    subtotal: String(inv.subtotal || amount),
    taxAmount: String(inv.taxAmount || 0),
    totalAmount: amount,
    notes: inv.description || inv.reference || inv.originalFilename || null,
    vendor,
    vendorId: vendor?.id || inv.vendorId || null,
    department,
    departmentId: department?.id || inv.departmentId,
    requestedBy: user,
  };
  if (existingIndex >= 0) purchaseOrders[existingIndex] = po;
  else purchaseOrders.unshift(po);
  const invoiceIndex = invoices.findIndex((item) => item.id === inv.id);
  if (invoiceIndex >= 0) {
    invoices[invoiceIndex] = {
      ...invoices[invoiceIndex],
      poId: po.id,
      purchaseOrder: po,
    };
  }
  return po;
}

function runAgentVerification(invoice) {
  const inv = hydrateInvoice(invoice);
  const errors = [];
  const warnings = [];
  const amount = Number(inv.totalAmount || inv.amountPkr || 0);
  const po = inv.purchaseOrder || purchaseOrders.find((item) => item.invoiceId === inv.id);
  if (!inv.invoiceNumber && !inv.reference) errors.push('Invoice number or reference is required');
  if (amount <= 0) errors.push('Invoice amount must be greater than zero');
  if (!inv.vendorId || !inv.vendor) errors.push('Vendor must be selected before head approval');
  if (!po) errors.push('Synced purchase order is required');
  if (po && po.departmentId !== inv.departmentId) {
    errors.push('Purchase order department must match invoice department');
  }
  if (po && inv.vendorId && po.vendorId !== inv.vendorId) {
    errors.push('Purchase order vendor must match invoice vendor');
  }
  if (po && Number(po.totalAmount || 0) !== amount) {
    errors.push('Purchase order total must match invoice total');
  }
  if (!inv.dueDate) warnings.push('Due date is not provided');
  if (!inv.description) warnings.push('Description is not provided');
  const index = invoices.findIndex((item) => item.id === inv.id);
  if (index >= 0) {
    invoices[index] = {
      ...invoices[index],
      extracted: {
        ...(invoices[index].extracted || {}),
        agentVerification: {
          status: errors.length ? 'FAILED' : 'PASSED',
          checkedAt: new Date().toISOString(),
          errors,
          warnings,
        },
      },
    };
  }
  return { errors, warnings };
}

function releaseInvoiceToFinance(invoice, actor) {
  const inv = hydrateInvoice(invoice);
  const poIndex = purchaseOrders.findIndex((item) => item.id === inv.poId || item.invoiceId === inv.id);
  if (poIndex >= 0) purchaseOrders[poIndex].status = 'APPROVED';
  const existingIndex = tickets.findIndex((ticket) => ticket.invoiceId === inv.id);
  if (existingIndex < 0) {
    createTicketFromInvoice({
      invoiceId: inv.id,
      departmentId: inv.departmentId,
      title: inv.invoiceNumber || inv.reference || inv.description || 'Approved invoice',
      amountPkr: inv.amountPkr,
      originalFilename: inv.originalFilename,
    });
  } else {
    tickets[existingIndex] = {
      ...tickets[existingIndex],
      status: 'DOCS_REVIEW',
      assignedToId: 'u-ap',
      submittedToFinanceAt: new Date().toISOString(),
      purchaseOrderVerified: true,
      documentStatus: 'PENDING_REVIEW',
      notes: 'Department head approved; released to finance',
    };
  }
  syncTicketFromInvoice(inv);
  return hydrateInvoice(invoices.find((item) => item.id === inv.id) || inv);
}

function visiblePurchaseOrders(user) {
  if (!['DEPT_USER', 'DEPT_ADMIN'].includes(user.role)) return purchaseOrders;
  return purchaseOrders.filter((po) => (po.departmentId || po.department?.id) === user.departmentId);
}

function visibleQueries(user) {
  if (!['DEPT_USER', 'DEPT_ADMIN'].includes(user.role)) return queries;
  return queries.filter((query) => query.assignedToDepartmentId === user.departmentId);
}

function canUsePaymentOps(user) {
  return ['COMPANY_ADMIN', 'AP_CLERK'].includes(user.role);
}

function canUploadTicketAttachment(user, ticket) {
  if (ticket.status === 'PAYMENT_COMPLETE') return false;
  if (['COMPANY_ADMIN', 'AP_CLERK'].includes(user.role)) return true;
  if (
    user.role === 'DEPT_USER' &&
    ['NEW_REQUEST', 'WAITING_FOR_DOCS'].includes(ticket.status)
  ) {
    return true;
  }
  return user.role === 'CFO' && ticket.status === 'CFO_SIGN_PENDING';
}

function publicAttachment(attachment) {
  const { content, ...rest } = attachment;
  return rest;
}

function allowedTicketUpdateFields(user, status) {
  if (status === 'PAYMENT_COMPLETE') return new Set();
  if (user.role === 'COMPANY_ADMIN') return new Set(allTicketUpdateFields);
  if (user.role === 'AP_CLERK') return new Set(apStageFields[status] || []);
  if (user.role === 'DEPT_USER') return new Set(departmentStageFields[status] || []);
  if (user.role === 'DEPT_ADMIN') return new Set();
  return new Set(cfoStageFields[status] || []);
}

function applyTicketStatusSideEffects(ticket) {
  const now = new Date().toISOString();
  if (ticket.status === 'CFO_SIGN_PENDING') {
    ticket.bankPaymentStatus = 'UPLOADED';
  }
  if (ticket.status === 'BANK_EXECUTION_PENDING') {
    ticket.bankPaymentStatus = 'CFO_SIGNED';
    ticket.cfoSignedAt = now;
  }
  if (ticket.status === 'BANK_EXECUTED') {
    ticket.bankPaymentStatus = 'EXECUTED';
    ticket.bankExecutedAt = now;
  }
  if (ticket.status === 'MARKED_PAID_IN_XERO') {
    ticket.xeroSyncStatus = 'PAID_MARKED';
  }
  if (ticket.status === 'REQUESTER_NOTIFIED') {
    ticket.requesterNotifiedAt = now;
  }
  return ticket;
}

function createTicketFromInvoice({ invoiceId, departmentId, title, amountPkr, originalFilename }) {
  const ticket = {
    ...tickets[0],
    id: `t-${Date.now()}`,
    title,
    status: 'DOCS_REVIEW',
    priority: 'NORMAL',
    departmentId,
    assignedToId: 'u-ap',
    vendorId: null,
    vendor: null,
    vendorNameSnapshot: null,
    amountPkr: String(amountPkr || 0),
    paymentMethod: 'BANK_PORTAL',
    documentStatus: 'PENDING_REVIEW',
    missingDocuments: [],
    dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    expenseNature: 'OTHER',
    billType: 'STANDARD_INVOICE',
    xeroSyncStatus: 'NOT_READY',
    bankPaymentStatus: 'NOT_READY',
    whtFilerStatus: 'UNKNOWN',
    invoiceNumber: title,
    internalReference: `AP-${Date.now().toString().slice(-6)}`,
    requesterName: null,
    requesterEmail: null,
    purchaseOrderNumber: null,
    purchaseOrderRequired: true,
    purchaseOrderVerified: false,
    vendorAccountNumber: null,
    invoiceAccountNumber: null,
    accountVerificationStatus: 'NOT_CHECKED',
    accountVerificationSource: null,
    submittedToFinanceAt: new Date().toISOString(),
    xeroContactId: null,
    xeroBillId: null,
    xeroBillNumber: null,
    xeroPaymentId: null,
    whtRate: null,
    whtAmountPkr: null,
    netPayablePkr: String(amountPkr || 0),
    voucherNumber: null,
    bankPortalReference: null,
    trelloCardId: null,
    trelloUrl: null,
    legacySheetRowId: null,
    legacySheetName: null,
    oldReference: null,
    parentTicketId: null,
    invoiceId,
    notes: originalFilename
      ? `Created automatically from invoice upload: ${originalFilename}`
      : 'Created automatically from invoice import',
    childTickets: [],
    activities: [],
  };
  tickets.unshift(ticket);
  return hydrate(ticket);
}

function meezanCsv(batch) {
  const headers = [
    'Beneficiary Name',
    'Beneficiary IBAN',
    'Beneficiary Bank',
    'Amount',
    'Currency',
    'Value Date',
    'Payment Reference',
    'Narration / Purpose',
  ];
  const rows = batch.payments.map((payment) => [
    payment.beneficiaryName,
    payment.iban,
    payment.bank,
    payment.amount,
    payment.currency,
    payment.valueDate,
    payment.paymentRef,
    payment.narration,
  ]);
  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function invoiceStatusFromTicketStatus(status) {
  if (status === 'PAYMENT_COMPLETE' || status === 'RECONCILED_CLOSED') return 'PAID';
  if (
    [
      'PAYMENT_PREPARATION',
      'BANK_UPLOAD',
      'CFO_SIGN_PENDING',
      'BANK_EXECUTION_PENDING',
      'BANK_EXECUTED',
      'MARKED_PAID_IN_XERO',
      'REQUESTER_NOTIFIED',
    ].includes(status)
  ) {
    return 'APPROVED';
  }
  if (['NEW_REQUEST', 'DEPARTMENT_HEAD_APPROVAL'].includes(status)) return 'AWAITING_APPROVAL';
  if (['MISSING_DOCS', 'REQUESTER_PINGED', 'WAITING_FOR_DOCS'].includes(status)) {
    return 'VENDOR_UNVERIFIED';
  }
  return 'VENDOR_VERIFIED';
}

function invoiceFromTicket(ticket) {
  const department =
    ticket.department || departments.find((item) => item.id === ticket.departmentId) || null;
  const vendor =
    ticket.vendor || vendors.find((item) => item.id === ticket.vendorId) || null;
  const purchaseOrder =
    purchaseOrders.find((item) => item.poNumber === ticket.purchaseOrderNumber) || null;
  const invoiceId = ticket.invoiceId || `inv-${ticket.id}`;
  ticket.invoiceId = invoiceId;
  return {
    id: invoiceId,
    invoiceNumber: ticket.invoiceNumber || null,
    reference: ticket.internalReference || ticket.oldReference || ticket.title || null,
    amountPkr: String(ticket.amountPkr || '0'),
    status: invoiceStatusFromTicketStatus(ticket.status),
    description: ticket.notes || ticket.title || null,
    invoiceDate: ticket.submittedToFinanceAt ? ticket.submittedToFinanceAt.slice(0, 10) : null,
    receivedDate: ticket.submittedToFinanceAt || null,
    dueDate: ticket.dueDate || null,
    currency: 'PKR',
    subtotal: String(ticket.amountPkr || '0'),
    taxAmount: '0',
    withholdingTax: String(ticket.whtAmountPkr || '0'),
    totalAmount: String(ticket.amountPkr || '0'),
    extracted: {
      source: 'demo-ticket-seed',
      ticketId: ticket.id,
      documentStatus: ticket.documentStatus,
    },
    departmentId: department?.id || ticket.departmentId || null,
    vendorId: vendor?.id || ticket.vendorId || null,
    poId: purchaseOrder?.id || null,
    department,
    vendor,
    purchaseOrder,
    originalFilename: `${ticket.invoiceNumber || ticket.id}.pdf`,
    mimeType: 'application/pdf',
    submittedBy: users.find((user) => user.email === ticket.requesterEmail) || null,
  };
}

function ensureSeedInvoices() {
  for (const ticket of tickets) {
    const invoiceId = ticket.invoiceId || `inv-${ticket.id}`;
    ticket.invoiceId = invoiceId;
    if (!invoices.some((invoice) => invoice.id === invoiceId)) {
      invoices.push(invoiceFromTicket(ticket));
    }
  }
}

ensureSeedInvoices();

const invoiceReviewStatuses = new Set([
  'UPLOADED',
  'EXTRACTED',
  'VENDOR_UNVERIFIED',
  'VENDOR_VERIFIED',
  'REJECTED',
]);

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:4001');
    const requestUser = currentUser(req);
    hydrate.currentUser = requestUser;

    if (req.method === 'OPTIONS') return send(res, 200, {});
    if (url.pathname === '/api/health') return send(res, 200, { ok: true });
    if (req.method === 'GET' && url.pathname === '/api/departments') {
      return send(res, 200, departments);
    }
    if (req.method === 'GET' && url.pathname === '/api/vendors') {
      return send(res, 200, vendors);
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readBody(req);
      const user = users.find(
        (item) =>
          item.email === String(body.email || '').toLowerCase() &&
          item.departmentId === body.departmentId,
      );
      if (!user || body.password !== 'changeme123') {
        return send(res, 401, { message: 'Invalid credentials' });
      }
      return send(res, 200, { accessToken: `demo-${user.id}`, user });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const name = String(body.name || '').trim();
      const password = String(body.password || '');
      const role = String(body.role || '').trim();
      const department = departments.find((item) => item.id === body.departmentId);
      const allowedRoles = new Set(['COMPANY_ADMIN', 'AP_CLERK', 'DEPT_USER', 'DEPT_ADMIN', 'CFO']);
      if (!name || !email || password.length < 6 || !department || !allowedRoles.has(role)) {
        return send(res, 400, { message: 'name, email, password, departmentId and role are required' });
      }
      if (users.some((item) => item.email === email)) {
        return send(res, 409, { message: 'Email is already registered' });
      }
      const user = {
        id: `u-${Date.now()}`,
        email,
        name,
        role,
        departmentId: department.id,
      };
      users.push(user);
      return send(res, 201, { accessToken: `demo-${user.id}`, user });
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      return send(res, 200, currentUser(req));
    }
    if (req.method === 'GET' && url.pathname === '/api/tickets/meta') {
      const assignees =
        requestUser.role === 'COMPANY_ADMIN'
          ? users
            : requestUser.role === 'AP_CLERK'
            ? users.filter((user) => ['COMPANY_ADMIN', 'AP_CLERK', 'CFO'].includes(user.role))
            : requestUser.role === 'CFO'
              ? users.filter((user) => user.id === requestUser.id)
              : users.filter((user) => user.departmentId === requestUser.departmentId);
      return send(res, 200, {
        departments,
        vendors,
        assignees,
        boardStatuses,
        boardColumns,
        statusLabels,
        canAssign: requestUser.role === 'COMPANY_ADMIN' || requestUser.role === 'AP_CLERK',
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/ap-ops/overview') {
      const scopedTickets = visibleTickets(requestUser);
      const scopedQueries = visibleQueries(requestUser);
      const scopedInvoices = visibleInvoices(requestUser);
      return send(res, 200, {
        invoices: scopedTickets.length + scopedInvoices.length,
        openQueries: scopedQueries.filter((query) => query.status === 'OPEN').length,
        pendingVerifications: scopedTickets.filter(
          (ticket) => ticket.documentStatus === 'PENDING_REVIEW',
        ).length,
        scheduledPayments: canUsePaymentOps(requestUser) ? scopedTickets.filter(
          (ticket) => ticket.bankPaymentStatus === 'READY_FOR_UPLOAD',
        ).length : 0,
        failedPayments: canUsePaymentOps(requestUser)
          ? scopedTickets.filter((ticket) => ticket.bankPaymentStatus === 'FAILED').length
          : 0,
        unreconciled: canUsePaymentOps(requestUser) ? paymentBatches.reduce(
          (sum, batch) => sum + batch.payments.length,
          0,
        ) : 0,
        unreadNotifications: scopedQueries.filter((query) => query.status === 'OPEN').length,
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/purchase-orders') {
      return send(res, 200, visiblePurchaseOrders(requestUser));
    }
    if (req.method === 'POST' && url.pathname === '/api/purchase-orders') {
      if (requestUser.role === 'AP_CLERK') {
        return send(res, 403, { message: 'AP can verify POs but department/company creates them' });
      }
      const body = await readBody(req);
      const department = departments.find((item) => item.id === body.departmentId);
      const vendor = vendors.find((item) => item.id === body.vendorId);
      if (requestUser.role === 'DEPT_USER' && body.departmentId !== requestUser.departmentId) {
        return send(res, 403, { message: 'Department users can only create own department POs' });
      }
      if (!body.poNumber || !department || !vendor) {
        return send(res, 400, { message: 'poNumber, departmentId and vendorId are required' });
      }
      const totalAmount = (body.lineItems || []).reduce(
        (sum, line) => sum + Number(line.quantity || 1) * Number(line.unitPrice || 0),
        0,
      );
      const po = {
        id: `po-${Date.now()}`,
        poNumber: String(body.poNumber),
        status: 'DRAFT',
        totalAmount: String(totalAmount),
        vendor,
        department,
      };
      purchaseOrders.unshift(po);
      return send(res, 201, po);
    }
    if (req.method === 'GET' && url.pathname === '/api/approval-matrix') {
      if (requestUser.role !== 'COMPANY_ADMIN') {
        return send(res, 403, { message: 'Company admin access is required' });
      }
      return send(res, 200, approvalRules);
    }
    if (req.method === 'POST' && url.pathname === '/api/approval-matrix') {
      if (requestUser.role !== 'COMPANY_ADMIN') {
        return send(res, 403, { message: 'Company admin access is required' });
      }
      const body = await readBody(req);
      const rule = {
        id: `rule-${Date.now()}`,
        minAmount: String(body.minAmount || 0),
        maxAmount: String(body.maxAmount || 999999999),
        requiredRole: String(body.requiredRole || 'COMPANY_ADMIN'),
        approvalLevel: Number(body.approvalLevel || 1),
        department:
          departments.find((department) => department.id === body.departmentId) || null,
      };
      approvalRules.unshift(rule);
      return send(res, 201, rule);
    }
    if (req.method === 'GET' && url.pathname === '/api/payment-batches') {
      if (!canUsePaymentOps(requestUser)) {
        return send(res, 403, { message: 'AP or company admin access is required' });
      }
      return send(res, 200, paymentBatches);
    }
    if (req.method === 'POST' && url.pathname === '/api/payment-batches/from-approved') {
      if (!canUsePaymentOps(requestUser)) {
        return send(res, 403, { message: 'AP or company admin access is required' });
      }
      const eligible = tickets
        .map(hydrate)
        .filter((ticket) => ticket.documentStatus === 'COMPLETE')
        .slice(0, 10);
      if (!eligible.length) return send(res, 400, { message: 'No approved invoices available' });
      const batch = {
        id: `pb-${Date.now()}`,
        batchNumber: `PB-DEMO-${paymentBatches.length + 1}`,
        status: 'DRAFT',
        totalCount: eligible.length,
        totalAmount: String(
          eligible.reduce((sum, ticket) => sum + Number(ticket.netPayablePkr || ticket.amountPkr), 0),
        ),
        payments: eligible.map((ticket, index) => ({
          paymentRef: `PAY-DEMO-${Date.now()}-${index + 1}`,
          beneficiaryName: ticket.vendor?.displayName || ticket.vendorNameSnapshot || 'Vendor',
          iban: ticket.vendorAccountNumber || ticket.invoiceAccountNumber || '',
          bank: ticket.paymentMethod === 'BANK_PORTAL' ? 'Meezan Bank' : ticket.paymentMethod,
          amount: String(ticket.netPayablePkr || ticket.amountPkr),
          currency: 'PKR',
          valueDate: new Date().toISOString().slice(0, 10),
          narration: `${ticket.invoiceNumber || ticket.internalReference || ticket.id} ${ticket.title}`,
        })),
      };
      paymentBatches.unshift(batch);
      return send(res, 201, batch);
    }
    const batchExportMatch = url.pathname.match(/^\/api\/payment-batches\/([^/]+)\/meezan-export$/);
    if (batchExportMatch && req.method === 'GET') {
      if (!canUsePaymentOps(requestUser)) {
        return send(res, 403, { message: 'AP or company admin access is required' });
      }
      const batch =
        paymentBatches.find((item) => item.id === batchExportMatch[1]) || paymentBatches[0];
      batch.status = 'EXPORTED';
      return send(res, 200, {
        fileName: `${batch.batchNumber}-meezan.csv`,
        contentType: 'text/csv',
        csv: meezanCsv(batch),
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/payment-batches/bank-response') {
      if (!canUsePaymentOps(requestUser)) {
        return send(res, 403, { message: 'AP or company admin access is required' });
      }
      const body = await readBody(req);
      const rows = Array.isArray(body.rows) ? body.rows : [];
      return send(res, 200, { updated: rows.length, payments: rows });
    }
    if (req.method === 'GET' && url.pathname === '/api/queries') {
      return send(res, 200, visibleQueries(requestUser));
    }
    if (req.method === 'GET' && url.pathname === '/api/reference-data/tax-codes') {
      if (!canUsePaymentOps(requestUser)) {
        return send(res, 403, { message: 'AP or company admin access is required' });
      }
      return send(res, 200, taxCodes);
    }
    if (req.method === 'GET' && url.pathname === '/api/reference-data/gl-accounts') {
      if (!canUsePaymentOps(requestUser)) {
        return send(res, 403, { message: 'AP or company admin access is required' });
      }
      return send(res, 200, glAccounts);
    }
    if (req.method === 'GET' && url.pathname === '/api/xero/status') {
      if (!canUsePaymentOps(requestUser)) {
        return send(res, 403, { message: 'AP or company admin access is required' });
      }
      return send(res, 200, xeroConnections);
    }
    if (req.method === 'GET' && url.pathname === '/api/xero/auth-url') {
      if (requestUser.role !== 'COMPANY_ADMIN') {
        return send(res, 403, { message: 'Company admin access is required' });
      }
      return send(res, 200, {
        url: 'https://login.xero.com/identity/connect/authorize?client_id=demo',
      });
    }
    const xeroSyncMatch = url.pathname.match(/^\/api\/xero\/tickets\/([^/]+)\/sync-bill$/);
    if (xeroSyncMatch && req.method === 'POST') {
      if (!canUsePaymentOps(requestUser)) {
        return send(res, 403, { message: 'AP or company admin access is required' });
      }
      const index = tickets.findIndex((ticket) => ticket.id === xeroSyncMatch[1]);
      if (index < 0) return send(res, 404, { message: 'Ticket not found' });
      if (tickets[index].status === 'PAYMENT_COMPLETE') {
        return send(res, 403, { message: 'Payment complete tickets are locked for audit' });
      }
      if (tickets[index].status !== 'XERO_BILL_ENTRY') {
        return send(res, 400, {
          message: 'Xero bill can only be created at the Xero bill entry step',
        });
      }
      tickets[index] = {
        ...tickets[index],
        xeroSyncStatus: 'BILL_CREATED',
        xeroBillId: tickets[index].xeroBillId || `xero-bill-${Date.now()}`,
        xeroBillNumber: tickets[index].xeroBillNumber || `XBILL-${Date.now()}`,
      };
      return send(res, 200, { synced: true, ticket: hydrate(tickets[index]) });
    }
    const xeroPaidMatch = url.pathname.match(/^\/api\/xero\/tickets\/([^/]+)\/mark-paid$/);
    if (xeroPaidMatch && req.method === 'POST') {
      if (!canUsePaymentOps(requestUser)) {
        return send(res, 403, { message: 'AP or company admin access is required' });
      }
      const index = tickets.findIndex((ticket) => ticket.id === xeroPaidMatch[1]);
      if (index < 0) return send(res, 404, { message: 'Ticket not found' });
      if (tickets[index].status === 'PAYMENT_COMPLETE') {
        return send(res, 403, { message: 'Payment complete tickets are locked for audit' });
      }
      if (tickets[index].status !== 'BANK_EXECUTED') {
        return send(res, 400, {
          message: 'Payment can only be marked paid after bank execution',
        });
      }
      tickets[index] = {
        ...tickets[index],
        status: 'MARKED_PAID_IN_XERO',
        xeroSyncStatus: 'PAID_MARKED',
        xeroPaymentId: tickets[index].xeroPaymentId || `xero-payment-${Date.now()}`,
      };
      return send(res, 200, { synced: true, ticket: hydrate(tickets[index]) });
    }
    if (req.method === 'GET' && url.pathname === '/api/tickets/board') {
      const visible = visibleTickets(requestUser);
      return send(
        res,
        200,
        boardColumns.map((column) => ({
          ...column,
          tickets: visible.map(hydrate).filter((ticket) => column.statuses.includes(ticket.status)),
        })),
      );
    }
    if (req.method === 'GET' && url.pathname === '/api/tickets') {
      return send(res, 200, visibleTickets(requestUser).map(hydrate));
    }
    if (req.method === 'POST' && url.pathname === '/api/tickets') {
      return send(res, 405, {
        message:
          'Tickets are generated from invoice uploads/imports. Create an invoice instead.',
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/invoice-files/upload') {
      if (!['COMPANY_ADMIN', 'AP_CLERK', 'DEPT_USER'].includes(requestUser.role)) {
        return send(res, 403, {
          message: 'AP clerks, department users, and company admins create invoices',
        });
      }
      let raw = Buffer.alloc(0);
      for await (const chunk of req) raw = Buffer.concat([raw, Buffer.from(chunk)]);
      const text = raw.toString('utf8');
      const departmentId = text.match(/name="departmentId"\r?\n\r?\n([^\r\n-]+)/)?.[1]?.trim();
      const originalFilename =
        text.match(/filename="([^"]+)"/)?.[1] || 'uploaded-invoice';
      if (!departmentId) return send(res, 400, { message: 'departmentId is required' });
      if (requestUser.role === 'DEPT_USER' && departmentId !== requestUser.departmentId) {
        return send(res, 403, { message: 'Department users can only upload own department invoices' });
      }
      const invoice = {
        id: `inv-${Date.now()}`,
        invoiceNumber: null,
        reference: originalFilename,
        amountPkr: '0',
        status: 'EXTRACTED',
        description: null,
        invoiceDate: null,
        receivedDate: null,
        dueDate: null,
        currency: 'PKR',
        subtotal: '0',
        taxAmount: '0',
        withholdingTax: '0',
        totalAmount: '0',
        extracted: {
          note: 'Demo upload created this invoice. Complete AP verification from the generated ticket.',
        },
        departmentId,
        vendorId: null,
        department: departments.find((department) => department.id === departmentId),
        vendor: null,
        originalFilename,
        mimeType: req.headers['content-type'] || 'application/octet-stream',
        submittedBy: requestUser,
      };
      invoices.unshift(invoice);
      ensureInvoicePurchaseOrder(invoice, requestUser);
      upsertDepartmentTicketFromInvoice(invoice, requestUser);
      return send(res, 200, hydrateInvoice(invoice));
    }
    if (req.method === 'POST' && url.pathname === '/api/invoices/import/google-csv') {
      if (!['COMPANY_ADMIN', 'AP_CLERK', 'DEPT_USER'].includes(requestUser.role)) {
        return send(res, 403, {
          message: 'AP clerks, department users, and company admins create invoices',
        });
      }
      const body = await readBody(req);
      const departmentId = String(body.departmentId || '');
      const department = departments.find((item) => item.id === departmentId);
      if (!departmentId || !department) {
        return send(res, 400, { message: 'departmentId is required' });
      }
      if (requestUser.role === 'DEPT_USER' && departmentId !== requestUser.departmentId) {
        return send(res, 403, { message: 'Department users can only import own department invoices' });
      }
      const invoice = {
        id: `inv-${Date.now()}`,
        invoiceNumber: null,
        reference: 'Google CSV import',
        amountPkr: '0',
        status: 'EXTRACTED',
        description: 'Imported from published spreadsheet (CSV) URL',
        invoiceDate: null,
        receivedDate: null,
        dueDate: null,
        currency: 'PKR',
        subtotal: '0',
        taxAmount: '0',
        withholdingTax: '0',
        totalAmount: '0',
        extracted: {
          sourceUrl: body.url,
          note: 'Demo CSV import created this invoice. Complete AP verification from the generated ticket.',
        },
        departmentId,
        vendorId: null,
        department,
        vendor: null,
        originalFilename: 'import.csv',
        mimeType: 'text/csv',
        submittedBy: requestUser,
      };
      invoices.unshift(invoice);
      ensureInvoicePurchaseOrder(invoice, requestUser);
      upsertDepartmentTicketFromInvoice(invoice, requestUser);
      return send(res, 200, hydrateInvoice(invoice));
    }
    if (req.method === 'GET' && url.pathname === '/api/invoices') {
      return send(res, 200, visibleInvoices(requestUser));
    }
    const paymentCheckoutMatch = url.pathname.match(
      /^\/api\/payments\/invoice\/([^/]+)\/checkout$/,
    );
    if (paymentCheckoutMatch && req.method === 'POST') {
      if (!['COMPANY_ADMIN', 'AP_CLERK'].includes(requestUser.role)) {
        return send(res, 403, { message: 'AP or company admin access is required' });
      }
      const invoice = findOrCreateVisibleInvoice(paymentCheckoutMatch[1], requestUser);
      if (!invoice) return send(res, 404, { message: 'Invoice not found' });
      if (invoice.status !== 'APPROVED') {
        return send(res, 400, { message: 'Only approved invoices can be sent to payment' });
      }
      return send(res, 200, {
        url: `http://127.0.0.1:5173/payments/success?session_id=${encodeURIComponent(
          `demo-${invoice.id}`,
        )}`,
      });
    }
    const invoiceDetailMatch = url.pathname.match(/^\/api\/invoices\/([^/]+)$/);
    if (invoiceDetailMatch && req.method === 'GET') {
      const invoice = findOrCreateVisibleInvoice(invoiceDetailMatch[1], requestUser);
      if (!invoice) return send(res, 404, { message: 'Invoice not found' });
      return send(res, 200, invoice);
    }
    if (invoiceDetailMatch && req.method === 'PATCH') {
      if (!['COMPANY_ADMIN', 'AP_CLERK', 'DEPT_USER'].includes(requestUser.role)) {
        return send(res, 403, { message: 'You cannot update invoice details' });
      }
      const visibleInvoice = findOrCreateVisibleInvoice(invoiceDetailMatch[1], requestUser);
      if (!visibleInvoice) return send(res, 404, { message: 'Invoice not found' });
      if (
        requestUser.role === 'DEPT_USER' &&
        !['UPLOADED', 'EXTRACTED', 'VENDOR_UNVERIFIED', 'VENDOR_VERIFIED', 'REJECTED'].includes(
          visibleInvoice.status,
        )
      ) {
        return send(res, 403, {
          message: 'Department can only complete invoice details before finance processing starts',
        });
      }
      const body = await readBody(req);
      const index = invoices.findIndex((invoice) => invoice.id === invoiceDetailMatch[1]);
      const current = hydrateInvoice(invoices[index]);
      const departmentId = body.departmentId || current.departmentId;
      const vendorId = body.vendorId || current.vendorId;
      const department = departments.find((item) => item.id === departmentId);
      const vendor = vendorId ? vendors.find((item) => item.id === vendorId) : null;
      if (!department) return send(res, 400, { message: 'Invalid department' });
      if (requestUser.role === 'DEPT_USER' && departmentId !== requestUser.departmentId) {
        return send(res, 403, { message: 'Department users cannot move invoices to another department' });
      }
      if (vendorId && !vendor) return send(res, 400, { message: 'Invalid vendor' });
      invoices[index] = {
        ...current,
        amountPkr: body.amountPkr != null ? String(body.amountPkr) : current.amountPkr,
        invoiceNumber:
          body.invoiceNumber !== undefined ? body.invoiceNumber : current.invoiceNumber,
        reference: body.reference !== undefined ? body.reference : current.reference,
        description:
          body.description !== undefined ? body.description : current.description,
        invoiceDate: body.invoiceDate !== undefined ? body.invoiceDate : current.invoiceDate,
        receivedDate: body.receivedDate !== undefined ? body.receivedDate : current.receivedDate,
        dueDate: body.dueDate !== undefined ? body.dueDate : current.dueDate,
        currency: body.currency !== undefined ? body.currency : current.currency,
        subtotal: body.subtotal != null ? String(body.subtotal) : current.subtotal,
        taxAmount: body.taxAmount != null ? String(body.taxAmount) : current.taxAmount,
        withholdingTax:
          body.withholdingTax != null ? String(body.withholdingTax) : current.withholdingTax,
        totalAmount: body.totalAmount != null ? String(body.totalAmount) : current.totalAmount,
        departmentId,
        department,
        vendorId: vendor?.id || null,
        vendor,
        status:
          vendor && invoiceReviewStatuses.has(current.status)
            ? 'VENDOR_VERIFIED'
            : current.status,
      };
      ensureInvoicePurchaseOrder(invoices[index], requestUser);
      upsertDepartmentTicketFromInvoice(invoices[index], requestUser);
      syncTicketFromInvoice(invoices[index]);
      return send(res, 200, hydrateInvoice(invoices[index]));
    }
    const submitApprovalMatch = url.pathname.match(
      /^\/api\/invoices\/([^/]+)\/submit-approval$/,
    );
    if (submitApprovalMatch && req.method === 'POST') {
      if (!['COMPANY_ADMIN', 'DEPT_USER'].includes(requestUser.role)) {
        return send(res, 403, { message: 'Only department or company admin can submit to department head' });
      }
      const visibleInvoice = findOrCreateVisibleInvoice(submitApprovalMatch[1], requestUser);
      if (!visibleInvoice) return send(res, 404, { message: 'Invoice not found' });
      if (requestUser.role === 'DEPT_USER' && visibleInvoice.departmentId !== requestUser.departmentId) {
        return send(res, 403, { message: 'Invoice is outside your department scope' });
      }
      if (Number(visibleInvoice.amountPkr) <= 0) {
        return send(res, 400, { message: 'Amount must be greater than zero' });
      }
      if (!visibleInvoice.vendorId || visibleInvoice.status !== 'VENDOR_VERIFIED') {
        return send(res, 400, {
          message: 'Vendor must be verified before sending for approval',
        });
      }
      const index = invoices.findIndex((invoice) => invoice.id === submitApprovalMatch[1]);
      ensureInvoicePurchaseOrder(invoices[index], requestUser);
      const verification = runAgentVerification(invoices[index]);
      if (verification.errors.length) {
        return send(res, 400, {
          message: `Agent verification failed: ${verification.errors.join('; ')}`,
        });
      }
      invoices[index] = {
        ...hydrateInvoice(invoices[index]),
        status: 'AWAITING_APPROVAL',
      };
      const ticketIndex = tickets.findIndex((ticket) => ticket.invoiceId === invoices[index].id);
      if (ticketIndex >= 0) {
        tickets[ticketIndex] = {
          ...tickets[ticketIndex],
          status: 'DEPARTMENT_HEAD_APPROVAL',
          notes: 'Agent verification passed; waiting for department head approval',
        };
      }
      return send(res, 200, hydrateInvoice(invoices[index]));
    }

    const approvalMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)$/);
    if (approvalMatch && req.method === 'POST') {
      if (!['COMPANY_ADMIN', 'DEPT_ADMIN'].includes(requestUser.role)) {
        return send(res, 403, { message: 'Only department head or company admin can approve' });
      }
      const body = await readBody(req);
      const invoice = findOrCreateVisibleInvoice(approvalMatch[1], requestUser);
      if (!invoice) return send(res, 404, { message: 'Invoice not found' });
      if (requestUser.role === 'DEPT_ADMIN' && invoice.departmentId !== requestUser.departmentId) {
        return send(res, 403, { message: 'You can only approve invoices for your department' });
      }
      if (invoice.status !== 'AWAITING_APPROVAL') {
        return send(res, 400, { message: 'Invoice is not awaiting approval' });
      }
      const index = invoices.findIndex((item) => item.id === approvalMatch[1]);
      invoices[index] = {
        ...hydrateInvoice(invoices[index]),
        status: body.approved ? 'APPROVED' : 'REJECTED',
        approvals: [
          {
            id: `approval-${Date.now()}`,
            approved: Boolean(body.approved),
            note: body.note || null,
            approver: requestUser,
            createdAt: new Date().toISOString(),
          },
        ],
      };
      if (body.approved) releaseInvoiceToFinance(invoices[index], requestUser);
      if (!body.approved) {
        const ticketIndex = tickets.findIndex((ticket) => ticket.invoiceId === invoices[index].id);
        if (ticketIndex >= 0) {
          const reason = body.note || 'Department head rejected';
          tickets[ticketIndex] = {
            ...tickets[ticketIndex],
            status: 'NEW_REQUEST',
            documentStatus: 'INCOMPLETE',
            missingDocuments: [`Department head rejection: ${reason}`],
            notes: `Rejected by department head: ${reason}`,
          };
        }
      }
      return send(res, 200, hydrateInvoice(invoices[index]));
    }

    const attachmentDownloadMatch = url.pathname.match(
      /^\/api\/tickets\/([^/]+)\/attachments\/([^/]+)\/download$/,
    );
    if (attachmentDownloadMatch && req.method === 'GET') {
      const ticket = visibleTickets(requestUser).find((item) => item.id === attachmentDownloadMatch[1]);
      if (!ticket) return send(res, 404, { message: 'Ticket not found' });
      const attachment = ticketAttachments.find(
        (item) => item.ticketId === ticket.id && item.id === attachmentDownloadMatch[2],
      );
      if (!attachment) return send(res, 404, { message: 'Attachment not found' });
      res.writeHead(200, {
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${attachment.fileName.replace(/"/g, '')}"`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      });
      res.end(attachment.content || `Demo file: ${attachment.fileName}`);
      return;
    }

    const attachmentMatch = url.pathname.match(/^\/api\/tickets\/([^/]+)\/attachments$/);
    if (attachmentMatch && req.method === 'GET') {
      const ticket = visibleTickets(requestUser).find((item) => item.id === attachmentMatch[1]);
      if (!ticket) return send(res, 404, { message: 'Ticket not found' });
      return send(
        res,
        200,
        ticketAttachments
          .filter((attachment) => attachment.ticketId === ticket.id)
          .map(publicAttachment),
      );
    }
    if (attachmentMatch && req.method === 'POST') {
      const ticket = visibleTickets(requestUser).find((item) => item.id === attachmentMatch[1]);
      if (!ticket) return send(res, 404, { message: 'Ticket not found' });
      if (!canUploadTicketAttachment(requestUser, ticket)) {
        return send(res, 403, { message: 'You cannot upload attachments at this ticket stage' });
      }
      let raw = Buffer.alloc(0);
      for await (const chunk of req) raw = Buffer.concat([raw, Buffer.from(chunk)]);
      const text = raw.toString('utf8');
      const originalFilename = text.match(/filename="([^"]+)"/)?.[1] || 'ticket-attachment';
      const attachment = {
        id: `att-${Date.now()}`,
        ticketId: ticket.id,
        fileName: originalFilename,
        mimeType: req.headers['content-type']?.includes('multipart/form-data')
          ? 'application/octet-stream'
          : req.headers['content-type'] || 'application/octet-stream',
        fileSize: String(raw.length),
        documentType: /po|purchase[-_\s]?order/i.test(originalFilename)
          ? 'PO'
          : /receipt|slip/i.test(originalFilename)
            ? 'RECEIPT'
            : 'INVOICE',
        uploadedAt: new Date().toISOString(),
        uploadedBy: requestUser,
        content: `Demo uploaded attachment: ${originalFilename}`,
      };
      ticketAttachments.unshift(attachment);
      return send(res, 201, publicAttachment(attachment));
    }

    const commentMatch = url.pathname.match(/^\/api\/tickets\/([^/]+)\/comments$/);
    if (commentMatch && req.method === 'POST') {
      const ticket = visibleTickets(requestUser).find((item) => item.id === commentMatch[1]);
      if (!ticket) return send(res, 404, { message: 'Ticket not found' });
      const body = await readBody(req);
      const message = String(body.message || '').trim();
      if (!message) return send(res, 400, { message: 'Comment is required' });
      const index = tickets.findIndex((item) => item.id === ticket.id);
      const activity = {
        id: `activity-${Date.now()}`,
        type: 'comment',
        message,
        createdAt: new Date().toISOString(),
        actor: {
          id: requestUser.id,
          name: requestUser.name,
          email: requestUser.email,
        },
      };
      tickets[index] = {
        ...tickets[index],
        activities: [activity, ...(tickets[index].activities || [])],
      };
      return send(res, 201, hydrate(tickets[index]));
    }

    const ticketMatch = url.pathname.match(/^\/api\/tickets\/([^/]+)$/);
    if (ticketMatch && req.method === 'GET') {
      const visible = visibleTickets(requestUser);
      const ticket = visible.find((item) => item.id === ticketMatch[1]);
      if (!ticket) return send(res, 404, { message: 'Ticket not found' });
      return send(res, 200, hydrate(ticket));
    }
    if (ticketMatch && req.method === 'PATCH') {
      const body = await readBody(req);
      const index = tickets.findIndex((ticket) => ticket.id === ticketMatch[1]);
      if (index < 0) return send(res, 404, { message: 'Ticket not found' });
      const existing = tickets[index];
      const nextBody = { ...body };
      if (body.documentStatus === 'INCOMPLETE' && !body.status) {
        nextBody.status = 'MISSING_DOCS';
      }
      if (body.documentStatus === 'COMPLETE' && !body.status) {
        nextBody.status = 'VENDOR_PO_ACCOUNT_VERIFICATION';
      }
      if (
        ['DEPT_USER', 'DEPT_ADMIN'].includes(requestUser.role) &&
        existing.departmentId !== requestUser.departmentId
      ) {
        return send(res, 403, { message: 'Ticket is outside your department scope' });
      }
      if (
        requestUser.role === 'CFO' &&
        !visibleTickets(requestUser).some((ticket) => ticket.id === existing.id)
      ) {
        return send(res, 403, { message: 'Ticket is outside CFO signing scope' });
      }
      const bodyKeys = Object.keys(nextBody).filter((key) => nextBody[key] !== undefined);
      if (existing.status === 'PAYMENT_COMPLETE' && bodyKeys.length) {
        return send(res, 403, {
          message: 'Payment complete tickets are locked for audit',
        });
      }
      if (
        requestUser.role === 'CFO' &&
        bodyKeys.length &&
        existing.status !== 'CFO_SIGN_PENDING'
      ) {
        return send(res, 403, {
          message: 'CFO can only sign tickets waiting for CFO authorization',
        });
      }
      const allowedFields = allowedTicketUpdateFields(requestUser, existing.status);
      const forbidden = bodyKeys.filter((key) => !allowedFields.has(key));
      if (forbidden.length) {
        return send(res, 403, {
          message: `${requestUser.role} cannot update ticket fields: ${forbidden.join(', ')}`,
        });
      }
      if (
        requestUser.role === 'CFO' &&
        nextBody.bankPaymentStatus !== undefined &&
        nextBody.bankPaymentStatus !== 'CFO_SIGNED'
      ) {
        return send(res, 403, {
          message: 'CFO can only record the CFO signed bank status',
        });
      }
      if (requestUser.role === 'AP_CLERK' && nextBody.bankPaymentStatus === 'CFO_SIGNED') {
        return send(res, 403, { message: 'CFO signature must be recorded by CFO or company admin' });
      }
      if (nextBody.status && nextBody.status !== existing.status) {
        const allowed = (roleTransitions[requestUser.role]?.[existing.status] || []).filter(
          (status) => transitions[existing.status]?.includes(status),
        );
        if (!allowed.includes(nextBody.status)) {
          return send(res, 403, {
            message: `Status cannot move from ${existing.status} to ${nextBody.status} for ${requestUser.role}`,
          });
        }
      }
      if (
        Object.prototype.hasOwnProperty.call(nextBody, 'assignedToId') &&
        nextBody.assignedToId !== existing.assignedToId
      ) {
        if (!['COMPANY_ADMIN', 'AP_CLERK'].includes(requestUser.role)) {
          return send(res, 403, { message: 'Only AP and company admins can assign tickets' });
        }
        if (
          nextBody.assignedToId &&
          requestUser.role === 'AP_CLERK' &&
          !users.some(
            (user) =>
              user.id === nextBody.assignedToId &&
              ['COMPANY_ADMIN', 'AP_CLERK', 'CFO'].includes(user.role),
          )
        ) {
          return send(res, 403, { message: 'Assignee is outside your permitted AP scope' });
        }
      }
      tickets[index] = applyTicketStatusSideEffects({ ...existing, ...nextBody });
      return send(res, 200, hydrate(tickets[index] || tickets[0]));
    }

    return send(res, 404, { path: url.pathname });
  })
  .listen(4001, '127.0.0.1', () => {
    console.log('Demo API running at http://127.0.0.1:4001');
  });
