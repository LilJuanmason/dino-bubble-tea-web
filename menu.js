import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // Allow CORS for local development
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Faltan credenciales de Supabase en el servidor' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const { data: productos, error } = await supabase
            .from('productos')
            .select('*')
            .eq('disponible', true)
            .order('id');

        if (error) throw error;

        // Adapt format to match existing frontend expectations if needed
        const menuData = productos.map(p => ({
            id: p.id,
            title: p.nombre,
            description: p.descripcion,
            price: parseFloat(p.precio),
            category: p.categoria,
            image: p.imagen,
            popular: p.categoria === 'Especiales' || p.categoria === 'Frappes' ? true : false, // Simple heuristic for now
        }));

        return res.status(200).json(menuData);
    } catch (error) {
        console.error('Error al obtener menú:', error);
        return res.status(500).json({ error: 'Error al obtener el menú desde la base de datos' });
    }
}
