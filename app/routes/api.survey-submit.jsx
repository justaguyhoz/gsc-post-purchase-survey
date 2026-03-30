const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

export async function loader() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shopifyGraphQL(query, variables = {}) {
  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
    throw new Error(
      'Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN environment variables.'
    );
  }

  const response = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN,
      },
      body: JSON.stringify({query, variables}),
    }
  );

  const json = await response.json();

  if (!response.ok) {
    throw new Error(`Shopify lookup failed with status ${response.status}`);
  }

  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

async function fetchOrderById(orderId) {
  const query = `
    query GetOrderById($id: ID!) {
      node(id: $id) {
        ... on Order {
          id
          name
          email
          customer {
            firstName
            lastName
            email
          }
          billingAddress {
            firstName
            lastName
          }
          shippingAddress {
            firstName
            lastName
          }
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, {id: orderId});
  return data?.node || null;
}

async function fetchOrderWithRetry(orderId, attempts = 5, delayMs = 1500) {
  for (let i = 0; i < attempts; i += 1) {
    const order = await fetchOrderById(orderId);

    if (order) {
      return order;
    }

    if (i < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return null;
}

function extractCustomer(order) {
  if (!order) {
    return {
      orderNumber: '',
      customerName: '',
      customerEmail: '',
    };
  }

  const firstName =
    order?.customer?.firstName ||
    order?.shippingAddress?.firstName ||
    order?.billingAddress?.firstName ||
    '';

  const lastName =
    order?.customer?.lastName ||
    order?.shippingAddress?.lastName ||
    order?.billingAddress?.lastName ||
    '';

  return {
    orderNumber: order?.name || '',
    customerName: [firstName, lastName].filter(Boolean).join(' ').trim(),
    customerEmail: order?.customer?.email || order?.email || '',
  };
}

export async function action({request}) {
  try {
    const raw = await request.text();
    const body = raw ? JSON.parse(raw) : {};

    console.log('Survey submission received:', JSON.stringify(body, null, 2));
    console.log('Incoming orderId:', body.orderId);
    console.log('Incoming orderNumber:', body.orderNumber);

    const orderId = String(body.orderId || '').trim();
    const fallbackOrderNumber = String(body.orderNumber || '').trim();
    const heardAboutUs = String(body.heardAboutUs || '').trim();
    const mainReason = String(body.mainReason || '').trim();
    const notes = String(body.notes || '').trim();

    if (!heardAboutUs || !mainReason) {
      return Response.json(
        {ok: false, error: 'Missing required fields.'},
        {status: 400, headers: corsHeaders}
      );
    }

    let orderNumber = fallbackOrderNumber;
    let customerName = '';
    let customerEmail = '';

    if (orderId) {
      try {
        const order = await fetchOrderWithRetry(orderId, 5, 1500);
        console.log('Fetched Shopify order:', order);

        const extracted = extractCustomer(order);
        orderNumber = extracted.orderNumber || orderNumber;
        customerName = extracted.customerName;
        customerEmail = extracted.customerEmail;
      } catch (shopifyError) {
        console.error('Shopify lookup error:', shopifyError);
      }
    }

    const payload = {
      timestamp: new Date().toLocaleString('en-AU', {
  timeZone: 'Australia/Brisbane',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}),
      orderNumber,
      customerName,
      customerEmail,
      heardAboutUs,
      mainReason,
      notes,
    };

    console.log('Sending payload to Apps Script:', payload);

    if (!APPS_SCRIPT_URL) {
      throw new Error('Missing APPS_SCRIPT_URL environment variable.');
    }

    const scriptResponse = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    const scriptText = await scriptResponse.text();

    console.log('Apps Script response status:', scriptResponse.status);
    console.log('Apps Script response body:', scriptText);

    if (!scriptResponse.ok) {
      return Response.json(
        {ok: false, error: `Apps Script failed: ${scriptResponse.status} ${scriptText}`},
        {status: 500, headers: corsHeaders}
      );
    }

    return Response.json(
      {
        ok: true,
        scriptResponse: scriptText,
        lookupWorked: Boolean(orderNumber || customerName || customerEmail),
      },
      {headers: corsHeaders}
    );
  } catch (error) {
    console.error('Survey submit error:', error);

    return Response.json(
      {ok: false, error: error.message || 'Server error'},
      {status: 500, headers: corsHeaders}
    );
  }
}
