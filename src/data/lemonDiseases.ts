import { CONFIRM_STEP, DISCLAIMER, keyOf, type ConditionInfo } from './types'

const REGULATED =
  'In California this is a regulated citrus pest/disease. Do not move leaves, fruit or plant material off the property; report suspicions to the CDFA Pest Hotline (1-800-491-1899) or your county agricultural commissioner.'

const ISOLATE = 'Avoid moving affected leaves or cuttings to other plants; clean pruning tools between plants.'

type Entry = Omit<ConditionInfo, 'crop' | 'disclaimer'>

const entries: Entry[] = [
  {
    name: 'Algal Leaf Spot',
    shortDescription: 'Leaf spotting caused by a parasitic green alga (Cephaleuros), most common in warm, humid conditions.',
    visualSigns: ['Raised, velvety spots', 'Orange-rust to grey-green colour', 'Mostly on older leaves'],
    generalNextSteps: ['Improve air flow and reduce prolonged leaf wetness', ISOLATE, CONFIRM_STEP],
    severity: 'low',
  },
  {
    name: 'Anthracnose',
    shortDescription: 'A fungal disease (Colletotrichum) that typically affects stressed or damaged tissue.',
    visualSigns: ['Tan to brown dead patches', 'Patches often start at leaf tips or margins', 'Possible twig dieback'],
    generalNextSteps: ['Reduce plant stress (watering, sun damage)', ISOLATE, CONFIRM_STEP],
    severity: 'moderate',
  },
  {
    name: 'Bacterial Blight',
    shortDescription: 'Bacterial infection that causes dark, water-soaked lesions, often after cool, wet, windy weather.',
    visualSigns: ['Dark, water-soaked lesions', 'Lesions may spread along the leaf stem', 'Leaf drop'],
    generalNextSteps: ['Avoid overhead watering', ISOLATE, CONFIRM_STEP],
    severity: 'moderate',
  },
  {
    name: 'Black Spot',
    shortDescription: 'Citrus black spot is a fungal disease (Phyllosticta citricarpa); symptoms appear mainly on fruit, leaf symptoms are less common.',
    visualSigns: ['Small dark spots', 'Spots may have a lighter centre'],
    generalNextSteps: [REGULATED, CONFIRM_STEP],
    severity: 'regulated',
  },
  {
    name: 'Citrus Canker',
    shortDescription: 'A bacterial disease (Xanthomonas citri) that spreads with wind-driven rain and on contaminated tools or plant material.',
    visualSigns: ['Raised, corky, brown lesions', 'Lesions visible on both leaf surfaces', 'Yellow halo around lesions'],
    generalNextSteps: [REGULATED, CONFIRM_STEP],
    severity: 'regulated',
  },
  {
    name: 'Citrus Hindu Mite',
    shortDescription: 'Feeding damage from the citrus hindu mite, which lives in colonies on the underside of leaves.',
    visualSigns: ['Yellow spots, often along veins', 'Fine webbing on the leaf underside', 'Tiny mites visible with a hand lens'],
    generalNextSteps: ['Check the leaf underside with a magnifier', ISOLATE, CONFIRM_STEP],
    severity: 'moderate',
  },
  {
    name: 'Citrus Leafminer',
    shortDescription: 'Damage from the larvae of a small moth that tunnel inside young, tender leaves.',
    visualSigns: ['Winding, silvery trails inside the leaf', 'Curled or distorted new growth'],
    generalNextSteps: ['Damage is usually cosmetic on mature trees', 'Monitor new flushes of growth', CONFIRM_STEP],
    severity: 'low',
  },
  {
    name: 'Citrus Pest',
    shortDescription: 'General insect or pest damage. The source dataset uses this as a broad label without naming a specific pest.',
    visualSigns: ['Chewing, sucking or feeding damage', 'Visible insects, eggs or residue'],
    generalNextSteps: ['Inspect both leaf surfaces and nearby stems for insects', CONFIRM_STEP],
    severity: 'moderate',
    note: 'Broad dataset label: the specific pest is not identified.',
  },
  {
    name: 'Citrus Scab',
    shortDescription: 'A fungal disease (Elsinoë fawcettii) affecting young leaves and fruit during wet periods.',
    visualSigns: ['Raised, warty or corky pustules', 'Distorted or puckered leaves'],
    generalNextSteps: ['Reduce prolonged leaf wetness', ISOLATE, CONFIRM_STEP],
    severity: 'moderate',
  },
  {
    name: 'Curl Leaf',
    shortDescription: 'Leaf curling. It is a symptom with many possible causes, such as sap-feeding insects, mites, water stress or heat.',
    visualSigns: ['Leaves cupped or rolled', 'Possible insects on the underside'],
    generalNextSteps: ['Check the leaf underside for aphids or mites', 'Review watering', CONFIRM_STEP],
    severity: 'low',
    note: 'Symptom-level label: the underlying cause is not identified.',
  },
  {
    name: 'Dry Leaf',
    shortDescription: 'Drying or browning of leaf tissue, commonly linked to water stress, heat, root problems or salt build-up.',
    visualSigns: ['Brown, brittle tissue', 'Often begins at margins or tips'],
    generalNextSteps: ['Check soil moisture and drainage', CONFIRM_STEP],
    severity: 'low',
    note: 'Symptom-level label: the underlying cause is not identified.',
  },
  {
    name: 'Greening',
    shortDescription: 'Huanglongbing (HLB, citrus greening) is a serious bacterial disease spread by the Asian citrus psyllid. There is no cure.',
    visualSigns: ['Blotchy, asymmetric yellow mottling', 'Mottling does not match on both halves of the leaf', 'Possible small, upright, yellowed leaves'],
    generalNextSteps: [REGULATED, 'Nutrient deficiencies can look similar; only a lab test can confirm HLB.', CONFIRM_STEP],
    severity: 'regulated',
  },
  {
    name: 'Healthy',
    shortDescription: 'No disease pattern recognised on this leaf.',
    visualSigns: ['Uniform green colour', 'No spots, lesions, mottling or feeding damage'],
    generalNextSteps: ['Keep monitoring the tree regularly', 'Scan other leaves; one leaf does not represent the whole tree'],
    severity: 'none',
  },
  {
    name: 'Lemon Sooty Mold',
    shortDescription: 'A black fungal coating that grows on honeydew left by sap-sucking insects such as aphids, scale or whiteflies.',
    visualSigns: ['Black, powdery coating that can be wiped off', 'Sticky residue', 'Insects nearby'],
    generalNextSteps: ['Look for the insect producing the honeydew', 'Ants tending insects are a common sign', CONFIRM_STEP],
    severity: 'low',
  },
  {
    name: 'Melanose',
    shortDescription: 'A fungal disease (Diaporthe citri) linked to dead twigs in the canopy.',
    visualSigns: ['Small, raised, dark brown specks', 'Rough, sandpaper-like texture'],
    generalNextSteps: ['Dead wood in the canopy is the usual source', ISOLATE, CONFIRM_STEP],
    severity: 'low',
  },
  {
    name: 'Spider Mites',
    shortDescription: 'Feeding damage from spider mites, which thrive in hot, dry, dusty conditions.',
    visualSigns: ['Fine pale stippling', 'Fine webbing', 'Dull or bronzed leaves'],
    generalNextSteps: ['Check the leaf underside with a magnifier', 'Dusty conditions favour mites', CONFIRM_STEP],
    severity: 'moderate',
  },
  {
    name: 'Swallowtail Larval Herbivory / Deficiency',
    shortDescription: 'The source dataset combines chewing damage from swallowtail caterpillars and nutrient-deficiency symptoms under one label.',
    visualSigns: ['Chewed leaf edges or missing tissue', 'Or yellowing patterns from nutrient deficiency'],
    generalNextSteps: ['Inspect for caterpillars on young growth', 'If no chewing is visible, consider a soil or nutrient check', CONFIRM_STEP],
    severity: 'low',
    note: 'Combined dataset label: the model cannot separate the two causes.',
  },
  {
    name: 'Yellow Spot',
    shortDescription: 'Yellow spotting on the leaf. The source dataset does not specify a single cause.',
    visualSigns: ['Distinct yellow spots or patches'],
    generalNextSteps: ['Compare with nearby leaves and check the underside', CONFIRM_STEP],
    severity: 'low',
    note: 'Symptom-level label: the underlying cause is not identified.',
  },
]

export const LEMON_CONDITIONS: Record<string, ConditionInfo> = Object.fromEntries(
  entries.map((e) => [keyOf(e.name), { ...e, crop: 'Lemon', disclaimer: DISCLAIMER }]),
)

/** Look up by the model's class label (from metadata.json). */
export function lemonInfo(label: string): ConditionInfo | undefined {
  // exact normalised match only: a fuzzy fallback could attach the wrong advice
  return LEMON_CONDITIONS[keyOf(label)]
}
