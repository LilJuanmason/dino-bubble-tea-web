import { MercadoPagoConfig, Payment } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // Webhooks from MercadoPago are POST requests
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const mpAccessToken = process.env.MP_ACCESS_TOKEN;
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY; // Service role key ideally, or public if anon is enough

        if (!mpAccessToken || !supabaseUrl || !supabaseKey) {
            console.error('Missing config for webhook');
            return res.status(500).send('Webhook error: Missing config');
        }

        const { type, data } = req.body;

        // We only care about payment updates
        if (type === 'payment' && data && data.id) {
            const paymentId = data.id;

            // Initialize clients
            const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
            const payment = new Payment(client);
            const supabase = createClient(supabaseUrl, supabaseKey);

            // Verify payment with MercadoPago API
            const paymentInfo = await payment.get({ id: paymentId });

            const orderId = paymentInfo.external_reference;
            const status = paymentInfo.status; // 'approved', 'pending', 'rejected', etc.

            if (!orderId) {
                console.warn(`Payment ${paymentId} has no external_reference`);
                return res.status(200).send('OK');
            }

            // Update Supabase Database
            let dbStatus = 'pendiente';
            if (status === 'approved') dbStatus = 'pagado';
            if (status === 'rejected' || status === 'cancelled') dbStatus = 'cancelado';

            const { error: updateError } = await supabase
                .from('ordenes')
                .update({
                    estado: dbStatus,
                    metodo_pago: paymentInfo.payment_method_id
                })
                .eq('id', orderId);

            if (updateError) {
                console.error('Error updating order:', updateError);
                return res.status(500).send('Error updating DB');
            }

            // WhatsApp Notification via CallMeBot API
            if (status === 'approved') {
                console.log(`Order ${orderId} approved! Sending WhatsApp message...`);

                const callMeBotPhone = process.env.CALLMEBOT_PHONE;
                const callMeBotApiKey = process.env.CALLMEBOT_API_KEY;

                if (callMeBotPhone && callMeBotApiKey) {
                    // Fetch order details to build the ticket
                    const { data: orderData, error: fetchError } = await supabase
                        .from('ordenes')
                        .select('productos, total')
                        .eq('id', orderId)
                        .single();

                    if (!fetchError && orderData && orderData.productos) {
                        const shortId = orderId.split('-')[0].toUpperCase();
                        let message = `DINO BUBBLE TEA\n*NUEVO PEDIDO PAGADO*\nID: #DINO-${shortId}\n\n`;

                        orderData.productos.forEach(item => {
                            const itemName = item.variant ? `${item.title} (${item.variant})` : item.title;
                            message += `- ${item.quantity}x ${itemName}\n`;
                        });

                        message += `\n*TOTAL:* $${orderData.total} MXN`;

                        // CallMeBot requires URL encoding
                        const encodedMessage = encodeURIComponent(message);
                        const callMeBotUrl = `https://api.callmebot.com/whatsapp.php?phone=${callMeBotPhone}&text=${encodedMessage}&apikey=${callMeBotApiKey}`;

                        try {
                            // Vercel node fetch syntax
                            await fetch(callMeBotUrl);
                            console.log('WhatsApp notification sent successfully');
                        } catch (waError) {
                            console.error('Failed to send WhatsApp message:', waError);
                        }
                    }
                }
            }
        }

        // Always return 200 OK to MercadoPago so they know we received the webhook
        return res.status(200).send('OK');

    } catch (error) {
        console.error('Webhook Error:', error);
        return res.status(500).send('Webhook handler failed');
    }
}
