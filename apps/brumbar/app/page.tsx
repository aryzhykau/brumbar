'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';

type Tab = 'game' | 'combat' | 'skills' | 'features' | 'inventory';
type StatKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
type SaveStatus = 'loading' | 'saving' | 'saved' | 'error';
type JsonRecord = Record<string, unknown>;

type Weapon = {
  id: string;
  name: string;
  kind: string;
  damageDie: string;
  damageType: string;
  mastery: string;
  range?: string;
  isProf: boolean;
};

type TurnState = {
  number: number;
  actionUsed: boolean;
  bonusUsed: boolean;
  reactionUsed: boolean;
  movementUsed: number;
  dashUsed: boolean;
};

type AttackEntry = {
  weaponId: string;
  attackRoll: string;
  damageRoll: string;
};

type CharacterData = {
  name: string;
  charClass: string;
  race: string;
  background: string;
  level: number;
  proficiency: number;
  hp: number;
  maxHp: number;
  tempHp: number;
  ac: number;
  speed: number;
  hitDie: string;
  hitDiceCurrent: number;
  rageActive: boolean;
  rageUses: number;
  rageMax: number;
  reckless: boolean;
  stats: Record<StatKey, number>;
  saves: Record<StatKey, boolean>;
  skillProficiencies: Record<string, number>;
  weapons: Weapon[];
  coins: { gp: number; sp: number; cp: number };
  conditions: string[];
  deathSuccesses: number;
  deathFails: number;
  equipment: string;
  sessionNotes: string;
  turn: TurnState;
};

type StoredState = {
  data: CharacterData;
  rawExport: JsonRecord | null;
  savedAt: number;
};

type FileHandle = {
  getFile: () => Promise<File>;
  createWritable: () => Promise<{ write: (value: string) => Promise<void>; close: () => Promise<void> }>;
};

const STORAGE_KEY = 'brumbar-character-v1';
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const STAT_META: Array<{ key: StatKey; short: string; label: string }> = [
  { key: 'str', short: 'СИЛ', label: 'Сила' },
  { key: 'dex', short: 'ЛОВ', label: 'Ловкость' },
  { key: 'con', short: 'ТЕЛ', label: 'Телосложение' },
  { key: 'int', short: 'ИНТ', label: 'Интеллект' },
  { key: 'wis', short: 'МДР', label: 'Мудрость' },
  { key: 'cha', short: 'ХАР', label: 'Харизма' },
];

const SKILLS: Array<{ key: string; label: string; stat: StatKey; primal?: boolean }> = [
  { key: 'athletics', label: 'Атлетика', stat: 'str' },
  { key: 'acrobatics', label: 'Акробатика', stat: 'dex', primal: true },
  { key: 'sleight of hand', label: 'Ловкость рук', stat: 'dex' },
  { key: 'stealth', label: 'Скрытность', stat: 'dex', primal: true },
  { key: 'arcana', label: 'Магия', stat: 'int' },
  { key: 'history', label: 'История', stat: 'int' },
  { key: 'investigation', label: 'Анализ', stat: 'int' },
  { key: 'nature', label: 'Природа', stat: 'int' },
  { key: 'religion', label: 'Религия', stat: 'int' },
  { key: 'animal handling', label: 'Уход за животными', stat: 'wis' },
  { key: 'insight', label: 'Проницательность', stat: 'wis' },
  { key: 'medicine', label: 'Медицина', stat: 'wis' },
  { key: 'perception', label: 'Восприятие', stat: 'wis', primal: true },
  { key: 'survival', label: 'Выживание', stat: 'wis', primal: true },
  { key: 'deception', label: 'Обман', stat: 'cha' },
  { key: 'intimidation', label: 'Запугивание', stat: 'cha', primal: true },
  { key: 'performance', label: 'Выступление', stat: 'cha' },
  { key: 'persuasion', label: 'Убеждение', stat: 'cha' },
];

const FEATURES = [
  {
    name: 'Ярость',
    tag: 'Бонусное действие',
    text: 'Преимущество на проверки и спасброски Силы, +2 к урону силовых атак и сопротивление дробящему, колющему и рубящему урону.',
    href: 'https://next.dnd.su/class/barbarian',
  },
  {
    name: 'Безрассудная атака',
    tag: 'Перед первой атакой',
    text: 'Атаки Силой совершаются с преимуществом. До начала следующего хода атаки по Брумбару также идут с преимуществом.',
    href: 'https://next.dnd.su/class/barbarian',
  },
  {
    name: 'Чувство опасности',
    tag: 'Всегда',
    text: 'Преимущество на спасброски Ловкости, пока Брумбар не недееспособен.',
    href: 'https://next.dnd.su/class/barbarian',
  },
  {
    name: 'Первобытное знание',
    tag: 'Во время Ярости',
    text: 'Акробатику, Восприятие, Выживание, Запугивание и Скрытность можно проверять через Силу.',
    href: 'https://next.dnd.su/class/barbarian',
  },
  {
    name: 'Дварфийская устойчивость',
    tag: 'Вид',
    text: 'Сопротивление урону ядом и преимущество на спасброски против состояния Отравленный.',
    href: 'https://next.dnd.su/species/dwarf',
  },
  {
    name: 'Мастеровой',
    tag: 'Черта происхождения',
    text: 'Скидка 20% на немагические предметы и один временный предмет после долгого отдыха при наличии инструментов.',
    href: 'https://next.dnd.su/feats/311-crafter/',
  },
];

const CONDITION_OPTIONS = ['Отравлен', 'Испуган', 'Сбит с ног', 'Схвачен'];

const BASIC_ACTIONS = [
  { name: 'Рывок', text: 'Получите дополнительное перемещение, равное Скорости: ещё 30 футов.' },
  { name: 'Отход', text: 'До конца хода ваше перемещение не провоцирует атаки.' },
  { name: 'Уклонение', text: 'Атаки видимых врагов по вам идут с помехой; спасброски Ловкости — с преимуществом.' },
  { name: 'Помощь', text: 'Дайте союзнику преимущество на подходящую проверку или следующую атаку.' },
  { name: 'Подготовка', text: 'Назовите условие и подготовьте действие, которое выполните Реакцией.' },
  { name: 'Поиск', text: 'Совершите проверку Мудрости, чтобы заметить скрытое или неочевидное.' },
];

const DEFAULT_DATA: CharacterData = {
  name: 'Брумбар “Бочкобрюх”',
  charClass: 'Варвар',
  race: 'Горный дварф',
  background: 'Кузнец',
  level: 4,
  proficiency: 2,
  hp: 25,
  maxHp: 25,
  tempHp: 0,
  ac: 14,
  speed: 30,
  hitDie: 'к12',
  hitDiceCurrent: 4,
  rageActive: false,
  rageUses: 2,
  rageMax: 3,
  reckless: false,
  stats: { str: 17, dex: 14, con: 15, int: 8, wis: 12, cha: 10 },
  saves: { str: true, dex: false, con: true, int: false, wis: false, cha: false },
  skillProficiencies: {
    investigation: 1,
    athletics: 1,
    perception: 1,
    intimidation: 1,
    persuasion: 1,
  },
  weapons: [
    { id: 'greataxe', name: 'Бочколом', kind: 'Секира', damageDie: '1к12', damageType: 'рубящий', mastery: 'Прорубающее', isProf: true },
    { id: 'light-hammer', name: 'Лёгкий молот', kind: 'Простое оружие', damageDie: '1к4', damageType: 'дробящий', mastery: 'Быстрое', range: '20/60', isProf: true },
  ],
  coins: { gp: 14, sp: 9, cp: 9 },
  conditions: [],
  deathSuccesses: 0,
  deathFails: 0,
  equipment: 'Дорожная одежда, рюкзак, спальник, столовый набор, трутница, 10 факелов, рационы, бурдюк с элем, верёвка и инструменты кузнеца.',
  sessionNotes: '',
  turn: { number: 1, actionUsed: false, bonusUsed: false, reactionUsed: false, movementUsed: 0, dashUsed: false },
};

function modifier(score: number) {
  return Math.floor((score - 10) / 2);
}

function signed(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function barbarianRages(level: number) {
  if (level <= 2) return 2;
  if (level <= 5) return 3;
  if (level <= 11) return 4;
  if (level <= 16) return 5;
  return 6;
}

function getRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function getValue(value: unknown, fallback: unknown = '') {
  const record = getRecord(value);
  return record.value ?? fallback;
}

function plainText(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join(' ');
  const record = getRecord(value);
  const ownText = typeof record.text === 'string' ? record.text : '';
  const nested = Object.entries(record)
    .filter(([key]) => key !== 'text' && key !== 'marks' && key !== 'attrs' && key !== 'type')
    .map(([, child]) => plainText(child))
    .filter(Boolean)
    .join(' ');
  return `${ownText} ${nested}`.replace(/\s+/g, ' ').trim();
}

function buildFromExport(raw: JsonRecord): CharacterData {
  const inner = typeof raw.data === 'string' ? getRecord(JSON.parse(raw.data)) : getRecord(raw.data);
  const info = getRecord(inner.info);
  const vitality = getRecord(inner.vitality);
  const rawStats = getRecord(inner.stats);
  const rawSaves = getRecord(inner.saves);
  const rawSkills = getRecord(inner.skills);
  const rawCoins = getRecord(inner.coins);
  const profileLevel = Number(getValue(info.level, DEFAULT_DATA.level));
  const proficiency = Number(inner.proficiency ?? DEFAULT_DATA.proficiency);
  const stats = Object.fromEntries(
    STAT_META.map(({ key }) => [key, Number(getRecord(rawStats[key]).score ?? DEFAULT_DATA.stats[key])]),
  ) as Record<StatKey, number>;
  const saves = Object.fromEntries(
    STAT_META.map(({ key }) => [key, Boolean(getRecord(rawSaves[key]).isProf)]),
  ) as Record<StatKey, boolean>;
  const skillProficiencies = Object.fromEntries(
    SKILLS.map(({ key }) => [key, Number(getRecord(rawSkills[key]).isProf ?? 0)]),
  );
  const resources = Object.values(getRecord(inner.resources)).map(getRecord);
  const rageResource = resources.find((resource) => String(resource.name ?? '').toLocaleLowerCase('ru').includes('ярост'));
  const companion = getRecord(raw._dndHelper);
  const rawWeapons = Array.isArray(inner.weaponsList) ? inner.weaponsList.map(getRecord) : [];
  const weapons = rawWeapons.length
    ? rawWeapons.map((weapon, index) => {
        const importedName = String(getValue(weapon.name, `Оружие ${index + 1}`));
        const isAxe = importedName.toLocaleLowerCase('ru').includes('секир');
        const isHammer = importedName.toLocaleLowerCase('ru').includes('молот');
        const importedDamage = String(getValue(weapon.dmg, isAxe ? '1d12 + 3' : '1d4 + 3'));
        return {
          id: String(weapon.id ?? `weapon-${index}`),
          name: isAxe ? 'Бочколом' : importedName.replace('*', ''),
          kind: isAxe ? 'Секира' : isHammer ? 'Простое оружие' : 'Оружие',
          damageDie: (importedDamage.match(/\d+d\d+|\d+к\d+/i)?.[0] ?? importedDamage).replace('d', 'к'),
          damageType: String(getValue(weapon.dmgType, 'урон')),
          mastery: isAxe ? 'Прорубающее' : isHammer ? 'Быстрое' : '—',
          range: isHammer ? '20/60' : undefined,
          isProf: Boolean(weapon.isProf),
        };
      })
    : DEFAULT_DATA.weapons;
  const text = getRecord(inner.text);
  const equipment = plainText(getRecord(getRecord(text.equipment).value).data) || DEFAULT_DATA.equipment;
  const rageMax = barbarianRages(profileLevel);

  return {
    ...DEFAULT_DATA,
    name: String(getValue(inner.name, DEFAULT_DATA.name)),
    charClass: String(getValue(info.charClass, DEFAULT_DATA.charClass)),
    race: String(getValue(info.race, DEFAULT_DATA.race)),
    background: String(getValue(info.background, DEFAULT_DATA.background)),
    level: profileLevel,
    proficiency,
    hp: Number(getValue(vitality['hp-current'], DEFAULT_DATA.hp)),
    maxHp: Number(getValue(vitality['hp-max'], DEFAULT_DATA.maxHp)),
    tempHp: Number(getValue(vitality['hp-temp'], 0)),
    ac: Number(getValue(vitality.ac, DEFAULT_DATA.ac)),
    speed: Number(getValue(vitality.speed, DEFAULT_DATA.speed)),
    hitDie: String(getValue(vitality['hit-die'], 'd12')).replace('d', 'к'),
    hitDiceCurrent: Number(getValue(vitality['hp-dice-current'], profileLevel)),
    rageUses: Math.min(Number(rageResource?.current ?? rageMax), rageMax),
    rageMax,
    rageActive: Boolean(companion.rageActive),
    reckless: Boolean(companion.reckless),
    stats,
    saves,
    skillProficiencies,
    weapons,
    coins: {
      gp: Number(getValue(rawCoins.gp, 0)),
      sp: Number(getValue(rawCoins.sp, 0)),
      cp: Number(getValue(rawCoins.cp, 0)),
    },
    conditions: Array.isArray(companion.conditions) ? companion.conditions.map(String) : [],
    deathSuccesses: Number(vitality.deathSuccesses ?? 0),
    deathFails: Number(vitality.deathFails ?? 0),
    equipment,
    sessionNotes: String(companion.sessionNotes ?? ''),
    turn: {
      ...DEFAULT_DATA.turn,
      ...getRecord(companion.turn),
    } as TurnState,
  };
}

function normalizeCharacterData(value: CharacterData): CharacterData {
  return {
    ...DEFAULT_DATA,
    ...value,
    turn: { ...DEFAULT_DATA.turn, ...value.turn },
  };
}

function makeExport(raw: JsonRecord | null, data: CharacterData): JsonRecord {
  const outer = raw ? structuredClone(raw) : { jsonType: 'character', version: '2', edition: '2024' };
  const inner = typeof outer.data === 'string' ? getRecord(JSON.parse(outer.data)) : getRecord(outer.data);
  const vitality = getRecord(inner.vitality);
  const coins = getRecord(inner.coins);
  const resources = getRecord(inner.resources);

  for (const [key, value] of [
    ['hp-current', data.hp],
    ['hp-max', data.maxHp],
    ['hp-temp', data.tempHp],
    ['hp-dice-current', data.hitDiceCurrent],
  ] as const) {
    const field = getRecord(vitality[key]);
    field.value = value;
    vitality[key] = field;
  }
  vitality.deathSuccesses = data.deathSuccesses;
  vitality.deathFails = data.deathFails;
  inner.vitality = vitality;

  (['gp', 'sp', 'cp'] as const).forEach((key) => {
    const field = getRecord(coins[key]);
    field.value = data.coins[key];
    coins[key] = field;
  });
  inner.coins = coins;

  const rageKey = Object.keys(resources).find((key) =>
    String(getRecord(resources[key]).name ?? '').toLocaleLowerCase('ru').includes('ярост'),
  );
  if (rageKey) {
    const rage = getRecord(resources[rageKey]);
    rage.current = data.rageUses;
    rage.maxExpr = String(data.rageMax);
    rage.resolvedMax = data.rageMax;
    resources[rageKey] = rage;
    inner.resources = resources;
  }

  outer.data = JSON.stringify(inner);
  outer._dndHelper = {
    rageActive: data.rageActive,
    reckless: data.reckless,
    conditions: data.conditions,
    sessionNotes: data.sessionNotes,
    turn: data.turn,
    updatedAt: new Date().toISOString(),
  };
  return outer;
}

function downloadJson(raw: JsonRecord | null, data: CharacterData) {
  const blob = new Blob([JSON.stringify(makeExport(raw, data), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${data.name.replace(/[<>:"/\\|?*]/g, '_')}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('game');
  const [data, setData] = useState<CharacterData>(DEFAULT_DATA);
  const [rawExport, setRawExport] = useState<JsonRecord | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading');
  const [featureSearch, setFeatureSearch] = useState('');
  const [attackEntry, setAttackEntry] = useState<AttackEntry | null>(null);
  const [linkedFile, setLinkedFile] = useState(false);
  const [filePickerSupported, setFilePickerSupported] = useState(false);
  const readyRef = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<FileHandle | null>(null);
  const fileWriteQueue = useRef(Promise.resolve());

  const setCharacter = (update: Partial<CharacterData> | ((current: CharacterData) => CharacterData)) => {
    setData((current) => (typeof update === 'function' ? update(current) : { ...current, ...update }));
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as StoredState;
          if (!cancelled) {
            setData(normalizeCharacterData(parsed.data));
            setRawExport(parsed.rawExport);
          }
        } else {
          const response = await fetch(`${BASE_PATH}/character.json`);
          if (response.ok) {
            const imported = (await response.json()) as JsonRecord;
            if (!cancelled) {
              setRawExport(imported);
              setData(buildFromExport(imported));
            }
          }
        }
      } catch {
        // The embedded character remains usable if storage or the bundled JSON is unavailable.
      } finally {
        if (!cancelled) {
          readyRef.current = true;
          setSaveStatus('saved');
        }
      }
    }
    load();
    setFilePickerSupported('showOpenFilePicker' in window);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${BASE_PATH}/sw.js`).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!readyRef.current) return;
    setSaveStatus('saving');
    const timer = window.setTimeout(() => {
      const stored: StoredState = { data, rawExport, savedAt: Date.now() };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        if (handleRef.current) {
          const exportText = JSON.stringify(makeExport(rawExport, data), null, 2);
          fileWriteQueue.current = fileWriteQueue.current
            .then(async () => {
              const writable = await handleRef.current?.createWritable();
              if (!writable) return;
              await writable.write(exportText);
              await writable.close();
            })
            .then(() => setSaveStatus('saved'))
            .catch(() => setSaveStatus('error'));
        } else {
          setSaveStatus('saved');
        }
      } catch {
        setSaveStatus('error');
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [data, rawExport]);

  const strMod = modifier(data.stats.str);
  const dexMod = modifier(data.stats.dex);
  const attackBonus = strMod + data.proficiency;
  const rageDamage = data.rageActive ? 2 : 0;
  const movementMax = data.speed * (data.turn.dashUsed ? 2 : 1);
  const attackWeapon = attackEntry ? data.weapons.find((weapon) => weapon.id === attackEntry.weaponId) ?? null : null;
  const naturalAttackRoll = attackEntry?.attackRoll ? Number(attackEntry.attackRoll) : null;
  const damageDiceResult = attackEntry?.damageRoll ? Number(attackEntry.damageRoll) : null;
  const attackTotal = naturalAttackRoll === null ? null : naturalAttackRoll + (attackWeapon?.isProf ? attackBonus : strMod);
  const damageTotal = damageDiceResult === null ? null : damageDiceResult + strMod + rageDamage;
  const criticalAttack = naturalAttackRoll === 20;
  const filteredFeatures = FEATURES.filter((feature) =>
    `${feature.name} ${feature.tag} ${feature.text}`.toLocaleLowerCase('ru').includes(featureSearch.toLocaleLowerCase('ru')),
  );
  const passivePerception = useMemo(() => {
    const prof = data.skillProficiencies.perception ? data.proficiency : 0;
    return 10 + modifier(data.stats.wis) + prof;
  }, [data]);

  const changeHp = (amount: number) => setCharacter((current) => ({
    ...current,
    hp: Math.max(0, Math.min(current.maxHp, current.hp + amount)),
  }));

  const toggleCondition = (condition: string) => setCharacter((current) => ({
    ...current,
    conditions: current.conditions.includes(condition)
      ? current.conditions.filter((item) => item !== condition)
      : [...current.conditions, condition],
  }));

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text()) as JsonRecord;
      setRawExport(imported);
      setData(buildFromExport(imported));
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    } finally {
      event.target.value = '';
    }
  };

  const connectJsonFile = async () => {
    const picker = (window as unknown as {
      showOpenFilePicker?: (options: JsonRecord) => Promise<FileHandle[]>;
    }).showOpenFilePicker;
    if (!picker) return;
    try {
      const [handle] = await picker({ types: [{ description: 'JSON персонажа', accept: { 'application/json': ['.json'] } }] });
      const imported = JSON.parse(await (await handle.getFile()).text()) as JsonRecord;
      handleRef.current = handle;
      setLinkedFile(true);
      setRawExport(imported);
      setData(buildFromExport(imported));
    } catch {
      // Cancelling the picker should not interrupt the app.
    }
  };

  const shortRest = () => setCharacter((current) => ({
    ...current,
    rageActive: false,
    reckless: false,
    rageUses: Math.min(current.rageMax, current.rageUses + 1),
  }));

  const longRest = () => setCharacter((current) => ({
    ...current,
    hp: current.maxHp,
    tempHp: 0,
    rageActive: false,
    reckless: false,
    rageUses: current.rageMax,
    hitDiceCurrent: current.level,
    deathFails: 0,
    deathSuccesses: 0,
  }));

  const spendTurnPart = (part: 'actionUsed' | 'bonusUsed' | 'reactionUsed') => {
    setCharacter((current) => ({
      ...current,
      turn: { ...current.turn, [part]: !current.turn[part] },
    }));
  };

  const useAction = () => setCharacter((current) => ({
    ...current,
    turn: { ...current.turn, actionUsed: true },
  }));

  const openAttackCalculator = (weaponId: string) => {
    setAttackEntry({ weaponId, attackRoll: '', damageRoll: '' });
  };

  const finishAttack = () => {
    useAction();
    setAttackEntry(null);
  };

  const useBasicAction = (name: string) => setCharacter((current) => ({
    ...current,
    turn: {
      ...current.turn,
      actionUsed: true,
      dashUsed: name === 'Рывок' ? true : current.turn.dashUsed,
    },
  }));

  const enterRage = () => {
    if (data.turn.bonusUsed || data.rageActive || data.rageUses <= 0) return;
    setCharacter((current) => ({
      ...current,
      rageActive: true,
      rageUses: Math.max(0, current.rageUses - 1),
      turn: { ...current.turn, bonusUsed: true },
    }));
  };

  const useQuickRecovery = () => {
    if (data.turn.bonusUsed || data.hitDiceCurrent <= 0) return;
    setCharacter((current) => ({
      ...current,
      hitDiceCurrent: Math.max(0, current.hitDiceCurrent - 1),
      turn: { ...current.turn, bonusUsed: true },
    }));
  };

  const newTurn = () => setCharacter((current) => ({
    ...current,
    reckless: false,
    turn: {
      number: current.turn.number + 1,
      actionUsed: false,
      bonusUsed: false,
      reactionUsed: false,
      movementUsed: 0,
      dashUsed: false,
    },
  }));

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="avatar" aria-hidden="true">ББ</div>
        <div className="hero-copy">
          <p className="eyebrow">{data.charClass} · {data.level} уровень</p>
          <h1>{data.name.split('“')[0]} <span>{data.name.includes('“') ? `“${data.name.split('“')[1]}` : ''}</span></h1>
          <p className="subtitle">{data.race} · {data.background}</p>
        </div>
        <div className={`sync-dot ${saveStatus}`} aria-live="polite">
          <i />
          <span>{saveStatus === 'loading' ? 'Загрузка' : saveStatus === 'saving' ? 'Сохраняю' : saveStatus === 'error' ? 'Ошибка' : linkedFile ? 'JSON связан' : 'Сохранено'}</span>
        </div>
      </header>

      {tab === 'game' && (
        <>
          <section className="status-grid" aria-label="Основные показатели">
            <article className="hp-card">
              <div className="card-label"><span>Хиты</span><b>МАКС. {data.maxHp}</b></div>
              <div className="hp-control">
                <button aria-label="Уменьшить хиты на один" onClick={() => changeHp(-1)}>−</button>
                <strong>{data.hp}</strong>
                <button aria-label="Увеличить хиты на один" onClick={() => changeHp(1)}>+</button>
              </div>
              <div className="hp-track"><span style={{ width: `${(data.hp / data.maxHp) * 100}%` }} /></div>
              <div className="hp-presets">
                <button onClick={() => changeHp(-5)}>−5 урона</button>
                <button onClick={() => changeHp(5)}>+5 лечения</button>
                <button onClick={() => setCharacter({ tempHp: data.tempHp ? 0 : 5 })}>Временные: {data.tempHp}</button>
              </div>
            </article>

            <div className="quick-stats">
              <article><span>КД</span><strong>{data.ac}</strong><small>без доспехов</small></article>
              <article><span>Инициатива</span><strong>{signed(dexMod)}</strong><small>ловкость</small></article>
              <article><span>Скорость</span><strong>{data.speed}</strong><small>футов</small></article>
            </div>
          </section>

          <section className={`rage-card ${data.rageActive ? 'is-active' : ''}`}>
            <div className="rage-heading">
              <div><p className="eyebrow">Состояние</p><h2>Ярость</h2></div>
              <button className="rage-toggle" aria-pressed={data.rageActive} onClick={() => setCharacter({ rageActive: !data.rageActive })}>
                <span>{data.rageActive ? 'Активна' : 'Не активна'}</span><i />
              </button>
            </div>
            <div className="resource-control">
              <button aria-label="Потратить Ярость" onClick={() => setCharacter({ rageUses: Math.max(0, data.rageUses - 1) })}>−</button>
              <div className="rage-uses" aria-label={`Осталось ${data.rageUses} использований Ярости`}>
                {Array.from({ length: data.rageMax }, (_, index) => <i key={index} className={index < data.rageUses ? 'filled' : ''} />)}
                <span>{data.rageUses} из {data.rageMax}</span>
              </div>
              <button aria-label="Вернуть Ярость" onClick={() => setCharacter({ rageUses: Math.min(data.rageMax, data.rageUses + 1) })}>+</button>
            </div>
            {data.rageActive && (
              <div className="rage-rules">
                <span>+2 к урону</span><span>Преимущество: Сила</span><span>Сопротивление физ. урону</span>
              </div>
            )}
          </section>

          <section className="section-block">
            <div className="section-title">
              <div><p className="eyebrow">Кубы бросаешь сам</p><h2>Атаки</h2></div>
              <button className={`outline-toggle ${data.reckless ? 'active' : ''}`} aria-pressed={data.reckless} onClick={() => setCharacter({ reckless: !data.reckless })}>Безрассудно</button>
            </div>
            {data.reckless && <p className="combat-alert">Бросьте 2к20 и выберите больший. Атаки по вам тоже с преимуществом.</p>}
            <div className="attack-list">
              {data.weapons.map((weapon) => (
                <article className="attack-card" key={weapon.id}>
                  <div className="attack-top">
                    <div><h3>{weapon.name}</h3><p>{weapon.kind}{weapon.range ? ` · ${weapon.range} фт.` : ''} · {weapon.damageType}</p></div>
                    <span>{weapon.mastery}</span>
                  </div>
                  <div className="attack-formula">
                    <div><small>{data.reckless ? 'С преимуществом' : 'Бросьте'}</small><strong>{data.reckless ? '2к20' : 'к20'} {signed(weapon.isProf ? attackBonus : strMod)}</strong></div>
                    <i />
                    <div><small>При попадании</small><strong>{weapon.damageDie} {signed(strMod + rageDamage)}</strong></div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="section-block">
            <div className="section-title"><div><p className="eyebrow">Отметки</p><h2>Состояния</h2></div></div>
            <div className="condition-grid">
              {CONDITION_OPTIONS.map((condition) => (
                <button key={condition} className={data.conditions.includes(condition) ? 'active' : ''} aria-pressed={data.conditions.includes(condition)} onClick={() => toggleCondition(condition)}>{condition}</button>
              ))}
            </div>
          </section>

          {data.hp === 0 && (
            <section className="death-card">
              <div><p className="eyebrow">При смерти</p><h2>Спасброски</h2></div>
              <div className="death-row"><span>Успехи</span>{[1, 2, 3].map((item) => <button key={item} className={item <= data.deathSuccesses ? 'success' : ''} onClick={() => setCharacter({ deathSuccesses: item <= data.deathSuccesses ? item - 1 : item })} />)}</div>
              <div className="death-row"><span>Провалы</span>{[1, 2, 3].map((item) => <button key={item} className={item <= data.deathFails ? 'fail' : ''} onClick={() => setCharacter({ deathFails: item <= data.deathFails ? item - 1 : item })} />)}</div>
            </section>
          )}

          <section className="rest-row">
            <button onClick={shortRest}><span>Короткий отдых</span><small>+1 Ярость</small></button>
            <button onClick={longRest}><span>Долгий отдых</span><small>Восстановить всё</small></button>
          </section>
        </>
      )}

      {tab === 'combat' && (
        <section className="tab-page combat-page">
          <div className="turn-heading">
            <div><p className="eyebrow">Ход {data.turn.number}</p><h2>Бой</h2></div>
            <button onClick={newTurn}>Новый ход ↻</button>
          </div>

          <div className="economy-grid" aria-label="Экономика хода">
            <button className={data.turn.actionUsed ? 'spent' : ''} onClick={() => spendTurnPart('actionUsed')}>
              <span>Действие</span><strong>{data.turn.actionUsed ? 'Потрачено' : 'Доступно'}</strong>
            </button>
            <button className={data.turn.bonusUsed ? 'spent' : ''} onClick={() => spendTurnPart('bonusUsed')}>
              <span>Бонусное</span><strong>{data.turn.bonusUsed ? 'Потрачено' : 'Доступно'}</strong>
            </button>
            <button className={data.turn.reactionUsed ? 'spent' : ''} onClick={() => spendTurnPart('reactionUsed')}>
              <span>Реакция</span><strong>{data.turn.reactionUsed ? 'Потрачена' : 'Доступна'}</strong>
            </button>
            <div>
              <span>Перемещение</span><strong>{Math.max(0, movementMax - data.turn.movementUsed)} фт.</strong>
            </div>
          </div>

          <div className="combat-state">
            <span>Сейчас действует</span>
            <div>
              {data.rageActive && <b>Ярость</b>}
              {data.reckless && <b>Безрассудная атака</b>}
              {data.conditions.map((condition) => <b key={condition}>{condition}</b>)}
              {!data.rageActive && !data.reckless && data.conditions.length === 0 && <i>Нет активных эффектов</i>}
            </div>
          </div>

          <section className="combat-section">
            <div className="combat-section-title"><span>01</span><div><p>Действие</p><h3>Атаковать</h3></div></div>
            <div className="combat-weapon-list">
              {data.weapons.map((weapon) => (
                <article className="combat-weapon" key={weapon.id}>
                  <div className="combat-weapon-head">
                    <div><h4>{weapon.name}</h4><p>{weapon.kind}{weapon.range ? ` · ${weapon.range} фт.` : ''}</p></div>
                    <span>{weapon.mastery}</span>
                  </div>
                  <div className="combat-roll">
                    <div><small>{data.reckless ? 'С преимуществом' : 'Бросьте'}</small><strong>{data.reckless ? '2к20' : 'к20'} {signed(weapon.isProf ? attackBonus : strMod)}</strong></div>
                    <div><small>Урон</small><strong>{weapon.damageDie} {signed(strMod + rageDamage)}</strong></div>
                  </div>
                  <button disabled={data.turn.actionUsed} onClick={() => openAttackCalculator(weapon.id)}>{data.turn.actionUsed ? 'Действие потрачено' : 'Рассчитать атаку'}</button>
                </article>
              ))}
            </div>
            <button className={`reckless-combat ${data.reckless ? 'active' : ''}`} aria-pressed={data.reckless} onClick={() => setCharacter({ reckless: !data.reckless })}>
              <span><b>Безрассудная атака</b><small>Преимущество вам и врагам до следующего хода</small></span>
              <i />
            </button>
          </section>

          <section className="combat-section">
            <div className="combat-section-title"><span>02</span><div><p>Действие</p><h3>Другие варианты</h3></div></div>
            <div className="basic-action-grid">
              {BASIC_ACTIONS.map((action) => (
                <button key={action.name} disabled={data.turn.actionUsed} onClick={() => useBasicAction(action.name)}>
                  <strong>{action.name}</strong><span>{action.text}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="combat-section">
            <div className="combat-section-title bonus"><span>03</span><div><p>Бонусное действие</p><h3>Особые возможности</h3></div></div>
            <div className="combat-option-list">
              <article className={data.rageActive ? 'active' : ''}>
                <div><span>Ярость · {data.rageUses}/{data.rageMax}</span><h4>{data.rageActive ? 'Продлить Ярость' : 'Войти в Ярость'}</h4><p>{data.rageActive ? 'Продлите Ярость ещё на один раунд, не совершая атаку.' : 'Активирует сопротивления, преимущество Силы и +2 к урону.'}</p></div>
                <button disabled={data.turn.bonusUsed || (!data.rageActive && data.rageUses <= 0)} onClick={data.rageActive ? () => spendTurnPart('bonusUsed') : enterRage}>{data.turn.bonusUsed ? 'Потрачено' : data.rageActive ? 'Продлить' : 'Активировать'}</button>
              </article>
              <article>
                <div><span>Стойкий · костей {data.hitDiceCurrent}</span><h4>Быстрое восстановление</h4><p>Потратьте Кость хитов, бросьте {data.hitDie} и восстановите выпавшее количество хитов.</p></div>
                <button disabled={data.turn.bonusUsed || data.hitDiceCurrent <= 0} onClick={useQuickRecovery}>{data.turn.bonusUsed ? 'Потрачено' : `Потратить ${data.hitDie}`}</button>
              </article>
            </div>
          </section>

          <section className="combat-section">
            <div className="combat-section-title reaction"><span>04</span><div><p>Реакция</p><h3>Вне своего хода</h3></div></div>
            <article className="reaction-card">
              <div><span>Провоцированная атака</span><h4>Атака по уходящему врагу</h4><p>Бросьте к20 {signed(attackBonus)}. При попадании: 1к12 {signed(strMod + rageDamage)} рубящего урона.</p></div>
              <button disabled={data.turn.reactionUsed} onClick={() => spendTurnPart('reactionUsed')}>{data.turn.reactionUsed ? 'Потрачена' : 'Использовать'}</button>
            </article>
          </section>

          <section className="combat-section movement-section">
            <div className="combat-section-title movement"><span>05</span><div><p>Перемещение</p><h3>{Math.max(0, movementMax - data.turn.movementUsed)} из {movementMax} футов</h3></div></div>
            <div className="movement-track"><span style={{ width: `${Math.min(100, (data.turn.movementUsed / movementMax) * 100)}%` }} /></div>
            <div className="movement-controls">
              <button onClick={() => setCharacter({ turn: { ...data.turn, movementUsed: Math.max(0, data.turn.movementUsed - 5) } })}>−5</button>
              <button onClick={() => setCharacter({ turn: { ...data.turn, movementUsed: Math.min(movementMax, data.turn.movementUsed + 5) } })}>Пройти 5 фт.</button>
              {data.conditions.includes('Сбит с ног') && <button onClick={() => setCharacter({ turn: { ...data.turn, movementUsed: Math.min(movementMax, data.turn.movementUsed + Math.floor(data.speed / 2)) }, conditions: data.conditions.filter((item) => item !== 'Сбит с ног') })}>Встать · {Math.floor(data.speed / 2)} фт.</button>}
            </div>
            <p>Перемещение можно делить до и после действия.</p>
          </section>
        </section>
      )}

      {tab === 'skills' && (
        <section className="tab-page">
          <div className="page-heading"><p className="eyebrow">Формулы для физических кубов</p><h2>Характеристики</h2></div>
          <div className="ability-grid">
            {STAT_META.map((stat) => (
              <article key={stat.key}>
                <span>{stat.short}</span><strong>{signed(modifier(data.stats[stat.key]))}</strong><small>{data.stats[stat.key]}</small>
              </article>
            ))}
          </div>
          <div className="insight-strip"><span>Пассивное Восприятие</span><strong>{passivePerception}</strong></div>
          <div className="list-heading"><h3>Спасброски</h3><span>Бросьте к20</span></div>
          <div className="save-grid">
            {STAT_META.map((stat) => {
              const bonus = modifier(data.stats[stat.key]) + (data.saves[stat.key] ? data.proficiency : 0);
              return <div key={stat.key}><i className={data.saves[stat.key] ? 'proficient' : ''} /><span>{stat.label}</span><strong>{signed(bonus)}</strong></div>;
            })}
          </div>
          <div className="list-heading"><h3>Навыки</h3><span>Бросьте к20</span></div>
          <div className="skill-list">
            {SKILLS.map((skill) => {
              const prof = data.skillProficiencies[skill.key] ? data.proficiency : 0;
              const normal = modifier(data.stats[skill.stat]) + prof;
              const primal = data.rageActive && skill.primal ? strMod + prof : null;
              return (
                <div key={skill.key}>
                  <i className={prof ? 'proficient' : ''} />
                  <span>{skill.label}<small>{skill.stat.toUpperCase()}{primal !== null ? ' · через СИЛ' : ''}</small></span>
                  <strong>{signed(primal ?? normal)}</strong>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === 'features' && (
        <section className="tab-page">
          <div className="page-heading"><p className="eyebrow">Коротко и по делу</p><h2>Умения</h2></div>
          <label className="search-field"><span>⌕</span><input value={featureSearch} onChange={(event) => setFeatureSearch(event.target.value)} placeholder="Найти умение" /></label>
          <div className="feature-list">
            {filteredFeatures.map((feature) => (
              <article key={feature.name}>
                <div><span>{feature.tag}</span><a href={feature.href} target="_blank" rel="noreferrer">next.dnd.su ↗</a></div>
                <h3>{feature.name}</h3><p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'inventory' && (
        <section className="tab-page">
          <div className="page-heading"><p className="eyebrow">Снаряжение и данные</p><h2>Инвентарь</h2></div>
          <div className="coin-grid">
            {(['gp', 'sp', 'cp'] as const).map((coin) => (
              <article key={coin}>
                <span>{coin === 'gp' ? 'Золотые' : coin === 'sp' ? 'Серебряные' : 'Медные'}</span>
                <div><button onClick={() => setCharacter({ coins: { ...data.coins, [coin]: Math.max(0, data.coins[coin] - 1) } })}>−</button><strong>{data.coins[coin]}</strong><button onClick={() => setCharacter({ coins: { ...data.coins, [coin]: data.coins[coin] + 1 } })}>+</button></div>
              </article>
            ))}
          </div>
          <article className="equipment-card"><span>В рюкзаке</span><p>{data.equipment}</p></article>
          <article className="notes-card">
            <label htmlFor="notes">Заметки текущей сессии</label>
            <textarea id="notes" value={data.sessionNotes} onChange={(event) => setCharacter({ sessionNotes: event.target.value })} placeholder="NPC, долги, добыча, планы…" />
          </article>
          <section className="data-card">
            <div><p className="eyebrow">Данные персонажа</p><h3>JSON и GitHub Pages</h3></div>
            <p>Изменения сохраняются на этом устройстве сразу. Репозиторий GitHub Pages статический, поэтому обновлённый JSON можно скачать и заменить в репозитории.</p>
            <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={handleImport} />
            <div className="data-actions">
              <button onClick={() => importRef.current?.click()}>Импортировать</button>
              <button className="primary" onClick={() => downloadJson(rawExport, data)}>Скачать JSON</button>
              {filePickerSupported && <button onClick={connectJsonFile}>{linkedFile ? 'Файл связан' : 'Связать файл'}</button>}
            </div>
            {filePickerSupported && <small>Если связать локальный файл, приложение будет перезаписывать его после каждого изменения, пока вкладка открыта.</small>}
          </section>
        </section>
      )}

      {attackEntry && attackWeapon && (
        <div className="attack-modal-backdrop" role="presentation">
          <section className="attack-modal" role="dialog" aria-modal="true" aria-labelledby="attack-modal-title">
            <div className="attack-modal-head">
              <div><p className="eyebrow">Физические кубы</p><h2 id="attack-modal-title">Атака: {attackWeapon.name}</h2></div>
              <button aria-label="Закрыть расчёт атаки" onClick={() => setAttackEntry(null)}>×</button>
            </div>

            <div className="attack-input-block">
              <label htmlFor="attack-roll"><span>Что выпало на к20?</span><small>Бонус атаки {signed(attackWeapon.isProf ? attackBonus : strMod)}</small></label>
              <input
                id="attack-roll"
                type="number"
                inputMode="numeric"
                min="1"
                max="20"
                value={attackEntry.attackRoll}
                onChange={(event) => setAttackEntry({ ...attackEntry, attackRoll: event.target.value })}
                placeholder="1–20"
                autoFocus
              />
              {attackTotal !== null && (
                <div className={`attack-total ${naturalAttackRoll === 1 ? 'miss' : criticalAttack ? 'critical' : ''}`}>
                  <span>{naturalAttackRoll === 1 ? 'Натуральная 1 — автоматический промах' : criticalAttack ? 'Натуральная 20 — критическое попадание!' : 'Итог броска атаки'}</span>
                  <strong>{naturalAttackRoll === 1 ? 'Промах' : criticalAttack ? 'Крит!' : attackTotal}</strong>
                  {naturalAttackRoll !== 1 && <small>{naturalAttackRoll} {signed(attackWeapon.isProf ? attackBonus : strMod)} = {attackTotal}</small>}
                </div>
              )}
            </div>

            {naturalAttackRoll !== 1 && (
              <div className="attack-input-block damage-input-block">
                <label htmlFor="damage-roll">
                  <span>{criticalAttack ? `Бросьте 2${attackWeapon.damageDie.slice(1)} и введите сумму` : `Что выпало на ${attackWeapon.damageDie}?`}</span>
                  <small>Сила {signed(strMod)}{data.rageActive ? ` · Ярость +${rageDamage}` : ''}</small>
                </label>
                <input
                  id="damage-roll"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={attackEntry.damageRoll}
                  onChange={(event) => setAttackEntry({ ...attackEntry, damageRoll: event.target.value })}
                  placeholder={criticalAttack ? 'Сумма двух костей' : 'Результат кости'}
                />
                {damageTotal !== null && (
                  <div className="damage-result">
                    <span>Нанесено урона</span>
                    <strong>{damageTotal}</strong>
                    <small>{damageDiceResult} {signed(strMod)}{data.rageActive ? ` + ${rageDamage} Ярость` : ''} = {damageTotal} · {attackWeapon.damageType}</small>
                  </div>
                )}
              </div>
            )}

            <div className="attack-modal-actions">
              <button onClick={() => setAttackEntry(null)}>Отмена</button>
              <button className="primary" disabled={naturalAttackRoll === null} onClick={finishAttack}>Завершить атаку</button>
            </div>
          </section>
        </div>
      )}

      <nav className="bottom-nav" aria-label="Разделы приложения">
        <button className={tab === 'game' ? 'active' : ''} onClick={() => setTab('game')}><b>♥</b><span>Лист</span></button>
        <button className={tab === 'combat' ? 'active' : ''} onClick={() => setTab('combat')}><b>⚔</b><span>Бой</span></button>
        <button className={tab === 'skills' ? 'active' : ''} onClick={() => setTab('skills')}><b>◎</b><span>Навыки</span></button>
        <button className={tab === 'features' ? 'active' : ''} onClick={() => setTab('features')}><b>≡</b><span>Умения</span></button>
        <button className={tab === 'inventory' ? 'active' : ''} onClick={() => setTab('inventory')}><b>▣</b><span>Сумка</span></button>
      </nav>
    </main>
  );
}
