// Mock Data for Claims Platform
const MOCK_DATA = {
    claims: [
        {
            id: 'CLM-2024-889', brand: 'Toyota', model: 'Corolla', year: 2022, plate: 'KLPY-99', workshop: 'Taller Central', status: 'Siniestro de Alta', sla: 80, adjuster: 'Juan Muñoz', cost: 630000, date: '2024-11-20', createdAt: '2024-11-20T10:00:00Z', updatedAt: '2024-11-20T10:00:00Z',
            description: 'Colisión por alcance en parachoques trasero. Tercero culpable.',
            photos: [
                'https://images.unsplash.com/photo-1599525567636-646840647892?q=80&w=400&auto=format&fit=crop',
                'https://images.unsplash.com/photo-1625047509168-a7026f36de04?q=80&w=400&auto=format&fit=crop'
            ],
            repairItems: [
                { name: 'Parachoques Trasero', price: 180000 },
                { name: 'Foco Izquierdo', price: 450000 }
            ]
        },
        {
            id: 'CLM-2024-890', brand: 'Mazda', model: 'CX-5', year: 2023, plate: 'LPRT-22', workshop: 'Autofactoria', status: 'Con observaciones', sla: 40, adjuster: 'María González', cost: 1200000, date: '2024-11-25', createdAt: '2024-11-25T10:00:00Z', updatedAt: '2024-11-25T10:00:00Z',
            description: 'Choque lateral derecho. Puerta y tapabarro afectados.',
            photos: [
                'https://images.unsplash.com/photo-1489824904134-891ab64532f1?q=80&w=400&auto=format&fit=crop'
            ],
            repairItems: [
                { name: 'Puerta Derecha', price: 800000 },
                { name: 'Pintura Lateral', price: 400000 }
            ]
        },
        { id: 'CLM-2024-891', brand: 'Chevrolet', model: 'Sail', year: 2021, plate: 'JJHH-11', workshop: 'Mecánica Express', status: 'En revisión', sla: 60, adjuster: 'Carlos Pérez', cost: 450000, date: '2024-11-28', createdAt: '2024-11-28T10:00:00Z', updatedAt: '2024-11-28T10:00:00Z', description: 'Golpe frontal leve.', photos: [], repairItems: [] },
        { id: 'CLM-2024-892', brand: 'Ford', model: 'Ranger', year: 2024, plate: 'PPLK-88', workshop: 'Taller Central', status: 'Ingresado', sla: 10, adjuster: 'Ana Silva', cost: 0, date: '2024-12-01', createdAt: '2024-12-01T10:00:00Z', updatedAt: '2024-12-01T10:00:00Z', description: 'Ingreso por evaluación.', photos: [], repairItems: [] },
        { id: 'CLM-2024-893', brand: 'Nissan', model: 'Kicks', year: 2020, plate: 'HHYT-55', workshop: 'Autofactoria', status: 'En revisión', sla: 55, adjuster: 'Juan Muñoz', cost: 890000, date: '2024-11-22', createdAt: '2024-11-22T10:00:00Z', updatedAt: '2024-11-22T10:00:00Z', description: 'Reparación de abolladura puerta.', photos: [], repairItems: [] },
        { id: 'CLM-2024-894', brand: 'Hyundai', model: 'Tucson', year: 2022, plate: 'KKLL-33', workshop: 'Mecánica Express', status: 'Siniestro de Alta', sla: 90, adjuster: 'María González', cost: 1500000, date: '2024-11-15', createdAt: '2024-11-15T10:00:00Z', updatedAt: '2024-11-15T10:00:00Z', description: 'Cambio de frontal completo.', photos: [], repairItems: [] },
        { id: 'CLM-2024-895', brand: 'Kia', model: 'Sportage', year: 2023, plate: 'MMNN-44', workshop: 'Taller Central', status: 'Con observaciones', sla: 30, adjuster: 'Carlos Pérez', cost: 2100000, date: '2024-11-29', createdAt: '2024-11-29T10:00:00Z', updatedAt: '2024-11-29T10:00:00Z', description: 'Espera de repuestos importados.', photos: [], repairItems: [] }
    ]
};

const CLIENTES_SEED = [
    {
        id: 'cli_1',
        rut: '12.345.678-9',
        nombre: 'Juan Pérez',
        email: 'juan.perez@example.com',
        telefono: '+56 9 1234 5678',
        comuna: 'Santiago',
        direccion: 'Av. Siempre Viva 123',
        tipo: 'PERSONA',
        estado: 'ACTIVO',
        hhMo: 0,
        hhPinBicapa: 0,
        hhPinTricapa: 0,
        valorUf: 0,
        observaciones: '',
        logo: '',
        logoAuditor: '',
        creadoEn: '2025-01-01T10:00:00Z',
        actualizadoEn: '2025-01-01T10:00:00Z'
    },
    {
        id: 'cli_2',
        rut: '76.543.210-1',
        nombre: 'Transportes Araucanía Ltda.',
        email: 'contacto@araucaniatrans.cl',
        telefono: '+56 45 222 3344',
        comuna: 'Temuco',
        direccion: 'Camino Viejo 2450',
        tipo: 'EMPRESA',
        estado: 'ACTIVO',
        hhMo: 0,
        hhPinBicapa: 0,
        hhPinTricapa: 0,
        valorUf: 0,
        observaciones: 'Cliente con flota liviana.',
        logo: '',
        logoAuditor: '',
        creadoEn: '2025-01-05T09:00:00Z',
        actualizadoEn: '2025-01-05T09:00:00Z'
    }
];

const USUARIOS_SEED = [
    {
        id: 'usr_1',
        rut: '12.345.678-9',
        nombre: 'Administrador General',
        email: 'admin@kensa.cl',
        telefono: '+56 9 1111 1111',
        rol: 'ADMIN',
        estado: 'ACTIVO',
        ultimoAcceso: null,
        observaciones: '',
        clienteId: '',
        creadoEn: '2025-01-01T10:00:00Z',
        actualizadoEn: '2025-01-01T10:00:00Z'
    }
];
