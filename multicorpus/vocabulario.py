"""
Vocabulario canónico bilingüe de Harmony Finder (español / inglés).

Cada término tiene una clave interna y su nombre, descripción y sinónimos en los dos idiomas.
Las búsquedas trabajan siempre con la clave; el buscador acepta los sinónimos de los dos idiomas
sea cual sea el idioma de la interfaz, así que los resultados no dependen del idioma.

Revisado por Ezequiel Navarrete (documento «Vocabulario bilingüe de HarmoFind», 31-10-2026).
Se exporta a web/data/vocab.json.
"""

def T(es, en, desc_es="", desc_en="", sin_es=(), sin_en=()):
    return {"es": es, "en": en, "desc_es": desc_es, "desc_en": desc_en,
            "sin_es": list(sin_es), "sin_en": list(sin_en)}

# ------------------------------------------------------------------ procedimientos
CONCEPTOS = {
    "cadencia_autentica_perfecta": T(
        "cadencia auténtica perfecta", "perfect authentic cadence",
        "V → I al final de frase, tónica en el tiple", "V → I at a phrase end, tonic in the soprano",
        ["cadencia perfecta", "perfecta", "cadencia autentica", "cadencia conclusiva", "v i"],
        ["pac", "perfect cadence", "authentic cadence", "full close"]),
    "cadencia_autentica_imperfecta": T(
        "cadencia auténtica imperfecta", "imperfect authentic cadence",
        "V → I al final de frase, 3.º o 5.º en el tiple", "V → I at a phrase end, 3rd or 5th in the soprano",
        ["cadencia imperfecta", "imperfecta", "cadencia autentica imperfecta"],
        ["iac"]),
    "semicadencia": T(
        "semicadencia", "half cadence",
        "llegada a V al final de frase", "arrival on V at a phrase end",
        ["semicadencia", "cadencia suspensiva", "media cadencia"],
        ["hc", "half close", "imperfect cadence"]),
    "cadencia_rota": T(
        "cadencia rota", "deceptive cadence",
        "V → VI al final de frase", "V → VI at a phrase end",
        ["cadencia rota", "cadencia interrumpida", "rota", "v vi", "quinto sexto"],
        ["dc", "interrupted cadence", "deceptive"]),
    "cadencia_frigia": T(
        "cadencia frigia", "Phrygian half cadence",
        "iv6 → V en menor, bajo 6.º → 5.º", "iv6 → V in minor, bass 6 → 5",
        ["frigia", "cadencia frigia", "iv6 v"],
        ["phrygian cadence", "phrygian"]),
    "cadencia_plagal": T(
        "cadencia plagal", "plagal cadence",
        "IV → I al final de frase", "IV → I at a phrase end",
        ["plagal", "cadencia plagal", "iv i", "amen"],
        ["amen cadence"]),
    "sexta_cuarta_cadencial": T(
        "sexta y cuarta cadencial", "cadential six-four",
        "I64 → V → I al final de frase", "I64 → V → I at a phrase end",
        ["sexta y cuarta cadencial", "64 cadencial", "cuarta y sexta cadencial", "i64 v", "sexta cuarta"],
        ["cadential 6/4", "cadential 64", "cad64", "six-four"]),
    "tercera_picardia": T(
        "tercera de picardía", "Picardy third",
        "V → I mayor como acorde final en tonalidad menor", "V → major I as the final chord in a minor key",
        ["tercera de picardia", "picardia", "tercera picarda", "picarda", "final mayor en menor"],
        ["picardy third", "picardy", "tierce de picardie"]),
    "napolitana": T(
        "sexta napolitana", "Neapolitan sixth",
        "acorde de II rebajado", "chord on the lowered 2nd degree",
        ["napolitana", "sexta napolitana", "segundo rebajado", "ii rebajado", "bii", "napolitano", "acorde napolitano",
         "acorde de napolitana", "acorde de sexta napolitana", "bii6", "n"],
        ["neapolitan", "neapolitan chord", "n6", "neapolitan sixth chord"]),
    "napolitana_a_dominante": T(
        "napolitana → dominante", "Neapolitan to dominant",
        "bII6 → (I64) → V", "bII6 → (I64) → V",
        ["napolitana", "sexta napolitana", "dominante", "a la dominante", "resuel", "resolv", "64"],
        ["neapolitan", "neapolitan to dominant", "dominant"]),
    "sexta_aumentada": T(
        "sexta aumentada", "augmented sixth chord",
        "It / Fr / Ger", "It / Fr / Ger",
        ["sexta aumentada", "sextas aumentadas", "aumentada"],
        ["augmented sixth", "augmented sixths", "aug6", "+6", "aug 6"]),
    "sexta_aumentada_italiana": T(
        "sexta italiana", "Italian sixth", "It6", "It6",
        ["italiana", "sexta italiana"], ["italian sixth", "italian", "it6", "it+6", "it 6", "ita6"]),
    "sexta_aumentada_francesa": T(
        "sexta francesa", "French sixth", "Fr43", "Fr43",
        ["francesa", "sexta francesa"], ["french sixth", "french", "fr43", "fr+6", "fr6", "fr 4 3", "fr4/3"]),
    "sexta_aumentada_alemana": T(
        "sexta alemana", "German sixth", "Ger65", "Ger65",
        ["alemana", "sexta alemana"], ["german sixth", "german", "ger65", "ger+6", "gr+6", "ger6", "gr6", "ger 6 5", "ger6/5"]),
    "sexta_aumentada_a_64": T(
        "sexta aumentada → 6/4 cadencial", "augmented sixth to cadential six-four",
        "Ger65 → I64", "Ger65 → I64",
        ["alemana", "sexta aumentada", "64 cadencial", "sexta y cuarta cadencial", "cuarta y sexta", "i64", "64",
         "resolviendo en 64", "cadencial"],
        ["german", "augmented sixth", "cadential six-four", "cadential 64", "six-four"]),
    "dominante_secundaria": T(
        "dominante secundaria", "secondary dominant", "V/x", "V/x",
        ["dominante secundaria", "dominantes secundarias", "dominante auxiliar", "v/", "tonicizacion"],
        ["secondary dominants", "applied dominant", "applied chord", "tonicization"]),
    "dominante_secundaria_resuelta": T(
        "dominante secundaria resuelta", "resolved secondary dominant", "V/x → x", "V/x → x",
        ["dominante secundaria", "dominantes secundarias", "resuel", "resolv"],
        ["secondary dominant", "applied dominant", "resolved"]),
    "dominante_de_la_dominante": T(
        "dominante de la dominante", "dominant of the dominant", "V/V", "V/V",
        ["dominante de la dominante", "v/v", "v de v", "doble dominante"],
        ["double dominant", "v of v"]),
    "septima_disminuida_secundaria": T(
        "séptima disminuida secundaria", "secondary diminished seventh", "viio7/x", "viio7/x",
        ["septima disminuida secundaria", "disminuida secundaria", "viio7/", "septima disminuida como dominante"],
        ["applied leading-tone chord", "secondary leading-tone chord", "applied diminished seventh"]),
    "intercambio_modal": T(
        "intercambio modal", "modal mixture",
        "iv, bVI, bIII, iiø… en mayor", "iv, bVI, bIII, iiø… in major",
        ["intercambio modal", "prestamo modal", "acorde prestado", "mixtura", "cuarto grado menor en mayor",
         "sexto rebajado"],
        ["mode mixture", "borrowed chord", "borrowed chords", "mixture"]),
    "acorde_disminuido": T(
        "acorde disminuido", "diminished chord",
        "tríadas y séptimas disminuidas diatónicas", "diatonic diminished triads and sevenths",
        ["acorde disminuido", "acordes disminuidos", "disminuido", "triada disminuida"],
        ["diminished triad", "diminished chords", "diminished"]),
    "quinta_aumentada": T(
        "acorde de quinta aumentada", "augmented triad",
        "acordes aumentados (III+, V+…)", "augmented chords (III+, V+…)",
        ["quinta aumentada", "acorde aumentado", "triada aumentada", "aumentado"],
        ["augmented chord", "augmented fifth"]),
    "sexta_anadida": T(
        "acorde de sexta añadida", "added-sixth chord",
        "acorde con sexta añadida ([add6] / +6)", "chord with an added sixth ([add6] / +6)",
        ["sexta anadida", "sixte ajoutee", "add6"],
        ["added sixth", "add 6"]),
    "secuencia_quintas": T(
        "secuencia de quintas descendentes", "descending-fifths sequence",
        "≥4 fundamentales descendiendo por quintas", "≥4 roots falling by fifths",
        ["secuencia", "secuencias", "secuencia de quintas", "circulo de quintas", "progresion de quintas",
         "quintas descendentes"],
        ["sequence", "circle of fifths", "circle-of-fifths progression", "circle progression", "fifths sequence"]),
    "septima_de_dominante": T(
        "acorde de séptima de dominante", "dominant seventh chord",
        "mayor con 7ª menor: V7, V7/x…", "major triad with a minor 7th: V7, V7/x…",
        ["septima de dominante", "septimas de dominante", "septima dominante", "acorde de septima de dominante",
         "mayor con septima menor", "cuatriada de dominante"],
        ["dominant seventh", "dominant sevenths", "dominant 7th", "major-minor seventh", "dom7"]),
    "septima_disminuida": T(
        "acorde de séptima disminuida", "diminished seventh chord",
        "tres terceras menores: viiº7, viiº7/x", "three stacked minor thirds: viio7, viio7/x",
        ["septima disminuida", "septimas disminuidas", "acorde de septima disminuida", "cuatriada disminuida"],
        ["diminished seventh", "diminished sevenths", "fully diminished seventh", "dim7", "o7", "°7", "º7", "vii°7", "viio7", "viiº7"]),
    "septima_semidisminuida": T(
        "acorde de séptima semidisminuida", "half-diminished seventh chord",
        "disminuida con 7ª menor: viiø7, iiø7…", "diminished triad with a minor 7th: viiø7, iiø7…",
        ["semidisminuida", "semidisminuido", "septima semidisminuida", "septimas semidisminuidas",
         "septima de sensible", "acorde semidisminuido", "cuatriada semidisminuida"],
        ["half-diminished seventh", "half diminished seventh", "half-diminished", "half diminished", "m7b5", "ø7", "viiø7", "iiø7", "ø",
         "minor seventh flat five"]),
    "septima_menor": T(
        "acorde de séptima menor", "minor seventh chord",
        "menor con 7ª menor: ii7, vi7, iv7…", "minor triad with a minor 7th: ii7, vi7, iv7…",
        ["septima menor", "acorde de septima menor", "menor con septima menor", "cuatriada menor"],
        ["minor seventh", "minor sevenths", "minor 7th", "m7"]),
    "septima_mayor": T(
        "acorde de séptima mayor", "major seventh chord",
        "mayor con 7ª mayor: IM7, IVM7, VIM7…", "major triad with a major 7th: IM7, IVM7, VIM7…",
        ["septima mayor", "acorde de septima mayor", "mayor con septima mayor", "cuatriada mayor"],
        ["major seventh", "major sevenths", "major 7th", "maj7"]),
    "pedal_de_dominante": T(
        "pedal de dominante", "dominant pedal",
        "dominante sostenida en el bajo ≥2 compases con armonías ajenas encima",
        "dominant held in the bass for ≥2 bars with foreign harmonies above",
        ["pedal de dominante", "pedal", "nota pedal", "bajo pedal", "pedal dominante"],
        ["pedal point", "dominant pedal point"]),
    "modulacion": T(
        "modulación", "modulation", "cualquier cambio de tonalidad", "any change of key",
        ["modulacion", "cambio de tonalidad", "modula"],
        ["key change", "modulate", "modulating"]),
    "modulacion_diatonica": T(
        "modulación diatónica", "pivot-chord modulation",
        "por acorde común a las dos tonalidades", "through a chord common to both keys",
        ["modulacion diatonica", "diatonica", "acorde pivote", "acorde comun", "pivote diatonico", "acorde de enlace"],
        ["common-chord modulation", "diatonic modulation", "pivot chord", "pivot modulation"]),
    "modulacion_cromatica": T(
        "modulación cromática", "chromatic modulation",
        "por semitono cromático o pivote alterado", "through a chromatic semitone or an altered pivot",
        ["modulacion cromatica", "cromatica", "semitono cromatico", "pivote cromatico", "alteracion cromatica"],
        ["chromatic pivot"]),
    "modulacion_enarmonica": T(
        "modulación enarmónica", "enharmonic modulation",
        "7ª disminuida o V7 / sexta alemana reinterpretada; comprobado con la grafía de la partitura",
        "diminished seventh or V7 / German sixth respelled; checked against the score's spelling",
        ["modulacion enarmonica", "enarmonica", "enarmonico", "enarmonia", "reinterpretacion enarmonica"],
        ["enharmonic", "enharmonic pivot"]),
    "modulacion_directa": T(
        "modulación directa", "direct modulation",
        "sin acorde común ni enlace cromático", "with no common chord or chromatic link",
        ["modulacion directa", "directa", "brusca", "sin pivote", "sin preparacion", "modulacion de frase"],
        ["phrase modulation", "abrupt modulation"]),
    "modulacion_a_relativo": T(
        "modulación al relativo", "modulation to the relative key",
        "mayor ↔ relativo menor", "major ↔ relative minor",
        ["modulacion al relativo", "relativo menor", "relativo mayor", "al relativo"],
        ["relative key", "relative major", "relative minor", "to the relative"]),
    "modulacion_a_dominante": T(
        "modulación a la dominante", "modulation to the dominant",
        "a la tonalidad de la dominante", "to the dominant key",
        ["modulacion a la dominante", "a la dominante", "tono de la dominante"],
        ["dominant key", "to the dominant"]),
    "modulacion_a_homonimo": T(
        "modulación al homónimo", "modulation to the parallel key",
        "mayor ↔ menor homónimo", "major ↔ parallel minor",
        ["homonimo", "mayor menor homonimo", "cambio de modo"],
        ["parallel key", "parallel major", "parallel minor", "change of mode"]),
    "modulacion_a_tercera": T(
        "modulación a tonalidades de tercera", "third-related modulation",
        "a mediante / submediante", "to the mediant / submediant",
        ["modulacion por terceras", "mediante cromatica", "tercera cromatica", "relacion de tercera", "por terceras"],
        ["chromatic mediant", "mediant modulation", "third relation"]),
}

# Conceptos compuestos: todos los grupos deben aparecer en la consulta (en cualquier idioma).
REQUIERE = {
    "sexta_aumentada_a_64": [["alemana", "sexta aumentada", "aumentada", "german", "augmented sixth"],
                             ["64", "cadencial", "sexta y cuarta", "cuarta y sexta", "cadential", "six-four"]],
    "napolitana_a_dominante": [["napolitana", "bii", "segundo rebajado", "ii rebajado", "neapolitan"],
                               ["dominante", "resuel", "resolv", "64", "dominant"]],
    "dominante_secundaria_resuelta": [["dominante secundaria", "dominantes secundarias", "secondary dominant",
                                       "applied dominant"], ["resuel", "resolv"]],
}

# ------------------------------------------------------------------ menú Armonía
GRUPOS = {
    "cadencias": T("Cadencias", "Cadences"),
    "alterados": T("Acordes alterados", "Chromatic chords"),
    "secundarias": T("Dominantes secundarias", "Secondary dominants"),
    "modulacion": T("Modulación", "Modulation"),
    "otros": T("Otros recursos", "Other devices"),
    "cuatriadas": T("Cuatríadas", "Seventh chords"),
    "tipos": T("Tipos de acorde", "Chord types"),
    "progresiones": T("Progresiones", "Progressions"),
}

# ------------------------------------------------------------------ pasajes por tipo de acorde
FACETAS = {
    "tri": T("solo tríadas", "triads only", "solo acordes de tres sonidos", "only three-note chords",
             ["triadas", "triada", "solo triadas", "tres sonidos"], ["only triads", "triads", "three-note chords"]),
    "cua": T("con cuatríadas", "with seventh chords", "tríadas y al menos un acorde de séptima",
             "triads and at least one seventh chord",
             ["cuatriadas", "cuatriada", "con cuatriadas", "septimas", "acordes de septima", "con septimas",
              "cuatro sonidos", "triadas y cuatriadas"],
             ["with sevenths", "seventh chords", "triads and sevenths"]),
    "solocua": T("solo cuatríadas", "seventh chords only", "todos los acordes con séptima", "every chord has a seventh",
                 ["solo cuatriadas", "solo septimas"], ["only sevenths", "only seventh chords"]),
    "fund": T("sin inversiones", "root position only", "todos en estado fundamental", "all in root position",
              ["sin inversion", "estado fundamental", "en estado fundamental", "en fundamental", "posicion fundamental"],
              ["no inversions", "root position"]),
    "inv": T("con inversiones", "with inversions", "al menos un acorde invertido", "at least one inverted chord",
             ["invertidos", "inversiones"], ["inverted chords", "inversions"]),
    "inv1": T("con primera inversión", "with first inversion", "1ª inversión, ninguna 2ª ni 3ª",
              "first inversion, no second or third",
              ["primera inversion", "1a inversion", "con 1a inversion", "hasta primera inversion"],
              ["first inversion", "6 chords", "sixth chords"]),
    "inv2": T("con segunda inversión", "with second inversion", "al menos un acorde de sexta y cuarta",
              "at least one six-four chord",
              ["segunda inversion", "2a inversion", "con 2a inversion"], ["second inversion", "six-four chords"]),
    "inv3": T("con tercera inversión", "with third inversion", "al menos una séptima con la 7ª en el bajo",
              "at least one seventh chord with the seventh in the bass",
              ["tercera inversion", "3a inversion", "con 3a inversion"], ["third inversion", "4/2 chords"]),
    "nopres": T("sin acordes prestados", "no borrowed chords", "ningún acorde del modo paralelo",
                "no chord from the parallel mode",
                ["sin prestados", "sin prestamo", "sin prestamo modal", "sin intercambio modal"],
                ["no mixture", "without borrowed chords"]),
    "pres": T("con acordes prestados", "with borrowed chords", "iv, ♭VI, ♭III, iiø… en mayor; picardía en menor",
              "iv, ♭VI, ♭III, iiø… in major; Picardy third in minor",
              ["con prestados", "acordes prestados", "prestados", "con prestamo", "con prestamo modal"],
              ["with mixture", "borrowed chords", "borrowed"]),
    "nosec": T("sin dominantes secundarias", "no secondary dominants", "ninguna V/x ni viio/x", "no V/x or viio/x",
               ["sin secundarias", "sin dominante secundaria"], ["no applied chords", "without secondary dominants"]),
    "sec": T("con dominantes secundarias", "with secondary dominants", "al menos una V/x o viio/x",
             "at least one V/x or viio/x",
             ["con secundarias", "con dominante secundaria"], ["with applied chords"]),
    "diat": T("solo acordes diatónicos", "diatonic chords only", "sin secundarias, prestados ni alterados",
              "no secondary, borrowed or chromatic chords",
              ["solo diatonicos", "diatonicos", "sin alteraciones", "sin cromatismo", "sin acordes alterados"],
              ["diatonic", "diatonic only", "no chromaticism"]),
    "alt": T("con acordes alterados", "with chromatic chords", "napolitana, sextas aumentadas u otros",
             "Neapolitan, augmented sixths or others",
             ["acordes alterados", "alterados", "con cromatismo"], ["with altered chords", "chromatic chords", "altered chords"]),
    "nomod": T("sin modular", "no modulation", "una sola tonalidad", "a single key",
               ["sin modulacion", "sin modulaciones", "una sola tonalidad"], ["one key", "single key", "without modulation"]),
    "conmod": T("con modulación", "with modulation", "cambia de tonalidad dentro del pasaje",
                "changes key within the passage",
                ["con modulaciones", "modulando", "con cambio de tonalidad"], ["modulating", "with key change"]),
}

# ------------------------------------------------------------------ filtros
PERIODOS = {
    "Renacimiento": T("Renacimiento", "Renaissance", "hasta 1600", "until 1600"),
    "Barroco": T("Barroco", "Baroque", "1600–1750", "1600–1750"),
    "Clasicismo": T("Clasicismo", "Classical", "1750–1820", "1750–1820", [], ["classical era", "classicism"]),
    "Romanticismo": T("Romanticismo", "Romantic", "1820–1900", "1820–1900", [], ["romantic era", "romanticism"]),
    "Siglo XX": T("Siglo XX", "20th century", "desde 1900", "from 1900", [], ["twentieth century"]),
}

# ------------------------------------------------------------------ forma
# Nivel 1: sección del movimiento. Nivel 2: zona dentro de la sección. Las funciones de frase
# (nivel 3) quedan para más adelante. Cada término lleva las etiquetas de Taking Form que recoge
# (en minúsculas, sin paréntesis) y, en las zonas de la forma sonata, las siglas de Hepokoski y Darcy,
# que el buscador acepta en cualquier idioma.
def F(nivel, es, en, tf=(), siglas=(), sin_es=(), sin_en=()):
    d = T(es, en, "", "", sin_es, sin_en)
    d.update(nivel=nivel, tf=list(tf), siglas=list(siglas))
    return d

FORMA = {
    # nivel 1
    "introduccion": F(1, "introducción", "introduction", ["introduction"]),
    "exposicion": F(1, "exposición", "exposition", ["exposition", "exposition repeat"]),
    "desarrollo": F(1, "desarrollo", "development", ["development", "c / development"]),
    "reexposicion": F(1, "reexposición", "recapitulation",
                      ["recapitulation", "a / recapitulation", "\"wrong key\" recapitulation", "reverse recapitulation",
                       "\"real\" recapitulation?", "reverse recaiputlation", "\"real\" recaiputlation?"],
                      sin_es=["recapitulacion", "reexposicion"], sin_en=["recap"]),
    "coda": F(1, "coda", "coda", ["coda"]),
    "tema": F(1, "tema", "theme", ["theme"]),
    "variacion": F(1, "variación", "variation", ["variation"], sin_es=["variaciones"], sin_en=["variations"]),
    "minueto": F(1, "minueto", "minuet", ["minuet", "menuet", "menuetto", "minuet da capo"]),
    "scherzo": F(1, "scherzo", "scherzo", ["scherzo", "scherzo da capo"]),
    "trio": F(1, "trío", "trio", ["trio"]),
    "seccion_a": F(1, "sección A", "section A", ["a", "a'", "a’"]),
    "seccion_b": F(1, "sección B", "section B", ["b", "b'", "b / transition"]),
    "seccion_c": F(1, "sección C", "section C", ["c"]),
    "seccion_d": F(1, "sección D", "section D", ["d"]),
    "fuga": F(1, "fuga", "fugue", ["fugue"]),
    # nivel 2
    "primer_grupo": F(2, "primer grupo temático", "primary theme",
                      ["first subject group", "first subject", "first subject group", "first group"], ["p"],
                      ["primer tema", "tema principal", "primer grupo"], ["first subject", "first group", "primary theme zone"]),
    "transicion": F(2, "transición", "transition", ["transition"], ["tr"]),
    "segundo_grupo": F(2, "segundo grupo temático", "secondary theme",
                       ["second subject group", "second subject", "second group", "\"false second subject\""], ["s"],
                       ["segundo tema", "tema secundario", "segundo grupo"], ["second subject", "second group", "secondary theme zone"]),
    "zona_conclusiva": F(2, "zona conclusiva", "closing section", ["codetta", "coda", "closing section"], ["c"],
                         ["codetta", "coda de la exposicion"], ["codetta", "closing zone"]),
    "retransicion": F(2, "retransición", "retransition", ["re-transition", "retransition"], ["rt"]),
    "preparacion_dominante": F(2, "preparación de la dominante", "dominant preparation",
                               ["dominant preparation", "dominant", "bass pedal", "dominant prolongation"]),
}
# Forma global del movimiento (filtro «Forma»). Las secciones de arriba son el filtro «Secciones».
def G(es, en, desc_es, desc_en, sin_es=(), sin_en=()):
    return T(es, en, desc_es, desc_en, sin_es, sin_en)

FORMAS_GLOBALES = {
    "forma_sonata": G("forma sonata", "sonata form", "exposición, desarrollo y reexposición", "exposition, development and recapitulation",
                      ["allegro de sonata", "forma de sonata"], ["sonata-allegro form", "sonata allegro form", "first-movement form"]),
    "rondo": G("rondó", "rondo", "estribillo que vuelve entre episodios", "a refrain returning between episodes",
               ["rondo", "rondeau", "forma rondo"], ["rondeau", "rondo form"]),
    "minueto_trio": G("minueto con trío", "minuet and trio", "minueto, trío y minueto da capo", "minuet, trio and minuet da capo",
                      ["minueto", "forma minueto", "menuetto", "minuetto"], ["minuet", "menuet", "menuetto"]),
    "scherzo_trio": G("scherzo con trío", "scherzo and trio", "scherzo, trío y scherzo da capo", "scherzo, trio and scherzo da capo",
                      ["scherzo"], ["scherzo"]),
    "tema_variaciones": G("tema con variaciones", "theme and variations", "un tema y sus variaciones", "a theme and its variations",
                          ["variaciones", "variacion", "tema y variaciones"], ["variations", "variation form"]),
    "binaria": G("forma binaria", "binary form", "dos partes, normalmente con repetición (danzas, sonatas de Scarlatti)",
                 "two parts, usually repeated (dances, Scarlatti sonatas)", ["binaria", "bipartita", "forma bipartita"], ["binary", "two-part form"]),
    "ternaria": G("forma ternaria", "ternary form", "A–B–A", "A–B–A", ["ternaria", "tripartita", "forma tripartita", "aba"], ["ternary", "three-part form"]),
    "fuga": G("fuga", "fugue", "fuga", "fugue", ["fugas", "fughetta"], ["fugues", "fughetta"]),
    "coral": G("coral", "chorale", "armonización de coral", "chorale harmonization", ["corales", "coral armonizado"], ["chorales", "chorale harmonization"]),
}

# Siglas que no son zonas propias: puntos de articulación (no se pueden buscar como tramo).
SIGLAS_PUNTO = {"mc": "cesura media / medial caesura", "eec": "cierre esencial de la exposición / essential expositional closure"}

# ------------------------------------------------------------------ utilidades
def sinonimos_concepto(k):
    """Todo lo que el buscador acepta para un concepto, en los dos idiomas."""
    c = CONCEPTOS[k]
    return list(dict.fromkeys([c["es"], c["en"], *c["sin_es"], *c["sin_en"]]))

def exportar():
    """Vocabulario para la web (web/data/vocab.json)."""
    return {"conceptos": CONCEPTOS, "grupos": GRUPOS, "facetas": FACETAS, "periodos": PERIODOS,
            "forma": FORMA, "formas_globales": FORMAS_GLOBALES, "requiere": REQUIERE}
