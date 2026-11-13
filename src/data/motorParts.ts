export type PhaseMode = 'monofasico' | 'bifasico' | 'trifasico';

export type MotorPartId =
  | 'bobinas-estator'
  | 'estator'
  | 'induzido'
  | 'bobinas'
  | 'comutador'
  | 'escovas'
  | 'porta-escovas'
  | 'eixo'
  | 'neutro';

export type CameraPresetId = 'geral' | 'induzido' | 'bobinas-estator' | 'escovas';

export interface MotorPartInfo {
  id: MotorPartId;
  index: string;
  name: string;
  shortLabel: string;
  category: 'Rotor' | 'Comutação' | 'Estator' | 'Mecânica' | 'Alimentação';
  summary: string;
  functionText: string;
  materialText: string;
  acBehaviorNote: string;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
}

export const MOTOR_PARTS: MotorPartInfo[] = [
  {
    id: 'bobinas-estator',
    index: '01',
    name: 'Bobinas do Estator (Campo CA)',
    shortLabel: 'Bobinas do Estator',
    category: 'Estator',
    summary: 'Enrolamentos de cobre excitados pelas fases CA para gerar o campo magnético B(t).',
    functionText:
      'Em modo monofásico (1Φ) geram campo pulsante; em bifásico (2Φ, 90°) ou trifásico (3Φ, 120°) produzem um campo magnético girante contínuo no entreferro.',
    materialText:
      'Fios de cobre esmaltado enrolados ao redor dos núcleos polares com carretéis isolantes de alta rigidez dielétrica.',
    acBehaviorNote:
      'A indutância das bobinas provoca atraso de fase (φ) da corrente em relação à tensão de cada fase, visível no osciloscópio.',
    cameraPosition: [3.7, 2.35, 2.45],
    cameraTarget: [-0.6, 0.05, -0.35],
  },
  {
    id: 'estator',
    index: '02',
    name: 'Núcleo Polar do Estator',
    shortLabel: 'Estator (Polos)',
    category: 'Estator',
    summary: 'Sapatas polares laminadas (2, 4 ou 6 polos conforme o sistema de fases).',
    functionText:
      'Conduz o fluxo magnético gerado pelas bobinas de fase até o entreferro. Suas chapas laminadas suportam fluxo alternado sem perdas excessivas.',
    materialText:
      'Aço-silício laminado e isolado com verniz para reduzir correntes parasitas (Foucault) e perdas por histerese em 60 Hz.',
    acBehaviorNote:
      'Em 2Φ e 3Φ, os polos adjacentes atingem o pico magnético em sequência temporal, fazendo o vetor B(t) girar ao redor do rotor.',
    cameraPosition: [4.4, 2.55, 3.4],
    cameraTarget: [0, 0.05, -0.2],
  },
  {
    id: 'induzido',
    index: '03',
    name: 'Núcleo do Induzido',
    shortLabel: 'Induzido (Núcleo)',
    category: 'Rotor',
    summary: 'Cilindro laminado rotativo com ranhuras que concentram o fluxo magnético no rotor.',
    functionText:
      'Acomoda de 1 a 24 bobinas nas ranhuras e fecha o circuito magnético entre os polos do estator, reduzindo a relutância do entreferro.',
    materialText:
      'Chapas finas de aço-silício estampadas e isoladas entre si para suportar fluxo alternado e rotação contínua.',
    acBehaviorNote:
      'Quanto maior o número de ranhuras e bobinas, mais uniforme é a distribuição do fluxo e menor a oscilação de torque no eixo.',
    cameraPosition: [3.0, 2.35, 2.1],
    cameraTarget: [0, 0.1, -0.35],
  },
  {
    id: 'bobinas',
    index: '04',
    name: 'Bobinas do Induzido',
    shortLabel: 'Bobinas do Induzido',
    category: 'Rotor',
    summary: 'Espiras rotativas (1 a 24 bobinas) onde atua a força magnética de Lorentz.',
    functionText:
      'Ao serem percorridas por corrente dentro do campo B(t), cada lado ativo da bobina sofre força tangencial F = i(t) · L × B(t), gerando torque.',
    materialText:
      'Condutores de cobre eletrolítico esmaltado alojados nas ranhuras do rotor e conectados às lâminas do comutador.',
    acBehaviorNote:
      'Com múltiplas bobinas (até 24), há sempre condutores ativos sob máxima indução magnética, suavizando o funcionamento.',
    cameraPosition: [2.75, 2.45, 1.55],
    cameraTarget: [0, 0.15, -0.35],
  },
  {
    id: 'comutador',
    index: '05',
    name: 'Comutador (Coletor)',
    shortLabel: 'Comutador',
    category: 'Comutação',
    summary: 'Anel de cobre segmentado (2 a 48 lâminas) isolado com mica e fixado ao eixo.',
    functionText:
      'Direciona a corrente para as bobinas na orientação espacial correta em relação ao campo do estator durante toda a rotação.',
    materialText:
      'Lâminas de cobre duro separadas por fendas isolantes de mica resistentes ao atrito das escovas e ao arco elétrico.',
    acBehaviorNote:
      'Quando uma fenda cruza a escova na Zona Neutra, a comutação acontece com mínima corrente induzida.',
    cameraPosition: [2.05, 1.35, 3.05],
    cameraTarget: [0, 0.05, 1.45],
  },
  {
    id: 'escovas',
    index: '06',
    name: 'Escovas de Carvão',
    shortLabel: 'Escovas de Carvão',
    category: 'Comutação',
    summary: 'Contatos deslizantes estacionários que alimentam o comutador em movimento.',
    functionText:
      'Estabelecem ponte elétrica contínua entre o circuito externo (Fase na escova direita e retorno ao Neutro N 0 V na escova esquerda) e o rotor girante.',
    materialText:
      'Grafite eletrolítico sinterizado autolubrificante, com cordoalha flexível ligada aos bornes da base.',
    acBehaviorNote:
      'A escova esquerda permanece referenciada ao Neutro (0 V, azul), enquanto a escova direita alterna entre +V e −V ao longo do ciclo CA.',
    cameraPosition: [2.3, 1.25, 2.8],
    cameraTarget: [0.45, 0.05, 1.45],
  },
  {
    id: 'porta-escovas',
    index: '07',
    name: 'Porta-Escovas e Molas',
    shortLabel: 'Porta-Escovas e Molas',
    category: 'Comutação',
    summary: 'Guias de latão com molas helicoidais que mantêm pressão constante nas escovas.',
    functionText:
      'Garantem contato estável contra o comutador mesmo em altas rotações, compensando o desgaste progressivo do grafite.',
    materialText:
      'Suportes isolados em latão, molas espirais em bronze fosforoso e cordoalhas flexíveis de cobre trançado.',
    acBehaviorNote:
      'Evitam trepidação mecânica (repique), reduzindo quedas de tensão e centelhamento no contato deslizante.',
    cameraPosition: [-2.4, 1.45, 2.9],
    cameraTarget: [-0.65, 0.08, 1.45],
  },
  {
    id: 'eixo',
    index: '08',
    name: 'Eixo e Mancais',
    shortLabel: 'Eixo de Saída',
    category: 'Mecânica',
    summary: 'Árvore de aço apoiada em mancais rígidos que entrega o torque útil.',
    functionText:
      'Mantém o rotor centralizado dentro do entreferro do estator e transmite potência mecânica na extremidade frontal.',
    materialText:
      'Aço retificado sobre mancais com buchas de bronze autolubrificante.',
    acBehaviorNote:
      'Em sistemas 2Φ e 3Φ, o campo girante reduz drasticamente a vibração torcional transmitida ao eixo.',
    cameraPosition: [2.9, 1.6, 4.2],
    cameraTarget: [0, 0, 1.6],
  },
  {
    id: 'neutro',
    index: '09',
    name: 'Neutro (0 V) e Zona Neutra',
    shortLabel: 'Neutro (N / 0 V)',
    category: 'Alimentação',
    summary: 'Terminal ligado à cordoalha da escova esquerda (retorno 0 V) e plano neutro de comutação.',
    functionText:
      'O fio da escova esquerda conecta-se diretamente ao borne Neutro N (0 V) e ao retorno comum (ou centro da estrela Y em 3Φ), fechando o circuito da armadura. No comutador, a Zona Neutra marca o eixo perpendicular ao campo onde ocorre a comutação.',
    materialText:
      'Borne de referência azul (0 V) ligado por cabo azul à escova esquerda e linha guia vertical no plano do comutador.',
    acBehaviorNote:
      'Enquanto a Fase oscila entre valores positivos e negativos no osciloscópio, o Neutro mantém a escova de retorno fixa em 0 V de referência.',
    cameraPosition: [-2.6, 1.35, 3.8],
    cameraTarget: [-0.7, -0.35, 1.75],
  },
];

export const CAMERA_PRESETS: Record<
  CameraPresetId,
  { label: string; position: [number, number, number]; target: [number, number, number] }
> = {
  geral: {
    label: 'Geral',
    position: [4.6, 2.65, 4.9],
    target: [-0.15, 0.05, 0.4],
  },
  induzido: {
    label: 'Induzido',
    position: [2.85, 2.4, 1.65],
    target: [0, 0.05, -0.35],
  },
  'bobinas-estator': {
    label: 'Bobinas do Estator',
    position: [3.4, 2.15, 2.55],
    target: [-0.5, 0.05, -0.35],
  },
  escovas: {
    label: 'Escovas e Comutador',
    position: [2.1, 1.25, 3.05],
    target: [0, 0.05, 1.45],
  },
};
