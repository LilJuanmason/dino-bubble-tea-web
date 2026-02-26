import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // CORS configuration
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { cart } = req.body;
    if (!cart || cart.length === 0) {
        return res.status(400).json({ message: 'Cart is empty' });
    }

    const mpAccessToken = process.env.MP_ACCESS_TOKEN;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!mpAccessToken || !supabaseUrl || !supabaseKey) {
        console.error('Missing environment variables');
        return res.status(500).json({ message: 'Internal Server Error: Missing config' });
    }

    // Initialize clients
    const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
    const supabase = createClient(supabaseUrl, supabaseKey);
    const preference = new Preference(client);

    try {
        // 1. Validate prices with Database (Security measure to prevent price tampering)
        const { data: dbProducts, error: dbError } = await supabase
            .from('productos')
            .select('id, precio, nombre');

        if (dbError) throw dbError;

        let orderTotal = 0;
        const items = cart.map(item => {
            // Find real price from DB
            const dbProduct = dbProducts.find(p => p.id === item.id);
            if (!dbProduct) throw new Error(`Product ${item.id} not found in database`);

            const realPrice = parseFloat(dbProduct.precio);
            orderTotal += realPrice * item.quantity;

            // Title formatting
            const title = item.variant ? `${dbProduct.nombre} (${item.variant})` : dbProduct.nombre;

            return {
                id: item.id.toString(),
                title: title,
                quantity: parseInt(item.quantity),
                unit_price: realPrice,
                currency_id: 'MXN'
            };
        });

        // 2. Create the order in Supabase with 'pendiente' status
        const { data: newOrder, error: orderError } = await supabase
            .from('ordenes')
            .insert([
                {
                    productos: cart,
                    total: orderTotal,
                    estado: 'pendiente'
                }
            ])
            .select('id')
            .single();

        if (orderError) throw orderError;

        const orderId = newOrder.id;

        // 3. Create Mercado Pago Preference
        // We pass the orderId in external_reference so the webhook knows which order to update
        const siteUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'; // Or whatever local port running

        // For local testing without Vercel local dev, let's just use placeholder URLs
        // WARNING: For webhooks to work locally requires ngrok, but for direct redirects this works
        const isLocal = !process.env.VERCEL_URL;
        const baseUrl = isLocal ? 'http://127.0.0.1:5500' : siteUrl; // Assumes Live Server default port

        const preferenceData = {
            items: items,
            back_urls: {
                success: `${baseUrl}/success.html?order_id=${orderId}`,
                failure: `${baseUrl}/index.html?payment=failed`,
                pending: `${baseUrl}/pending.html?order_id=${orderId}`
            },
            auto_return: 'approved',
            external_reference: orderId,
            notification_url: `${siteUrl}/api/webhook` // This needs to be a public URL to work. Handled later.
        };

        const response = await preference.create({ body: preferenceData });

        // 4. Return the checkout URL to the frontend
        res.status(200).json({
            init_point: response.init_point,
            orderId: orderId
        });

    } catch (error) {
        console.error('Error creating checkout preference:', error);
        res.status(500).json({ message: 'Error creating checkout interaction', error: error.message });
    }
}
