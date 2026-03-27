# Email to vCard

Créer automatiquement des fiches contact vCard (.vcf) à partir des emails reçus — depuis **Gmail**, **Outlook Web** et **Outlook Desktop**.

## Deux solutions incluses

| Solution | Clients supportés | Technologie |
|---|---|---|
| **Extension navigateur** | Gmail, Outlook Web | Chrome/Edge Extension (Manifest V3) |
| **Office Add-in** | Outlook Desktop, Outlook Web, Outlook Mobile | Office.js Add-in |

## Fonctionnalités

- **Extraction automatique** : nom, email, téléphone, mobile, société, fonction, adresse, site web
- **Parsing intelligent de la signature** : détecte les formats courants (FR et EN)
- **Aperçu éditable** : prévisualisation et modification des champs avant téléchargement
- **Téléchargement .vcf** : compatible avec tous les gestionnaires de contacts
- **Mode sombre** : support du dark mode (add-in)

---

## 1. Extension navigateur (Gmail + Outlook Web)

### Installation

1. Ouvrir `chrome://extensions/` (ou `edge://extensions/`)
2. Activer le **Mode développeur**
3. Cliquer sur **"Charger l'extension non empaquetée"**
4. Sélectionner le **dossier racine** de ce projet

### Utilisation

1. Ouvrir Gmail ou Outlook Web
2. Ouvrir un email
3. Cliquer sur le bouton **vCard** (barre d'outils ou flottant en bas à droite)
4. Vérifier/modifier les informations extraites
5. Cliquer sur **"Télécharger .vcf"**

---

## 2. Office Add-in (Outlook Desktop + Web + Mobile)

### Prérequis

- Node.js (v14+)
- Outlook Desktop (Windows ou Mac) ou Outlook Web

### Installation pour le développement

```bash
cd outlook-addin

# Générer les certificats SSL (requis par Office)
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -keyout certs/server.key \
  -out certs/server.crt -days 365 -nodes \
  -subj "/CN=localhost"

# Lancer le serveur
node server.js
```

### Charger l'add-in dans Outlook

#### Outlook Desktop (Windows)
1. Ouvrir Outlook → **Fichier** → **Gérer les compléments**
2. Choisir **"Mes compléments"** → **"Ajouter un complément personnalisé"** → **"Depuis un fichier"**
3. Sélectionner `outlook-addin/manifest.xml`

#### Outlook Desktop (Mac)
1. Ouvrir Outlook → **Outils** → **Compléments**
2. Cliquer sur **"+"** → **"Ajouter depuis un fichier"**
3. Sélectionner `outlook-addin/manifest.xml`

#### Outlook Web
1. Aller sur outlook.office.com ou outlook.live.com
2. Ouvrir un email → cliquer sur **"..."** → **"Obtenir des compléments"**
3. **"Mes compléments"** → **"Ajouter un complément personnalisé"** → **"Depuis une URL"**
4. Entrer : `https://localhost:3000/manifest.xml`

#### Outlook Mobile (iOS/Android)
L'add-in apparaît automatiquement si déployé via le centre d'administration Microsoft 365.

### Utilisation

1. Ouvrir un email dans Outlook
2. Cliquer sur le bouton **"Créer vCard"** dans le ruban (ou dans le menu "...")
3. Les informations sont extraites automatiquement
4. Modifier si nécessaire dans le panneau latéral
5. Cliquer sur **"Télécharger .vcf"** ou **"Copier vCard"**

---

## Structure du projet

```
├── manifest.json                  # Extension navigateur (Manifest V3)
├── src/
│   ├── signature-parser.js        # Parsing des signatures email
│   ├── vcard-generator.js         # Génération vCard 3.0
│   ├── content-gmail.js           # Intégration Gmail
│   ├── content-outlook.js         # Intégration Outlook Web
│   ├── main.js                    # Orchestration extension
│   └── styles.css                 # Styles extension
├── icons/
│   └── icon.svg                   # Icône de l'extension
└── outlook-addin/
    ├── manifest.xml               # Manifeste Office Add-in
    ├── taskpane.html              # Interface du panneau latéral
    ├── taskpane.js                # Logique du panneau (Office.js)
    ├── taskpane.css               # Styles (Fluent UI compatible)
    ├── signature-parser.js        # Parsing signatures (copie partagée)
    ├── vcard-generator.js         # Génération vCard (copie partagée)
    ├── server.js                  # Serveur HTTPS de développement
    └── package.json               # Dépendances Node.js
```

## Limitations

- Les sélecteurs CSS des webmails peuvent changer lors de mises à jour de Gmail/Outlook
- Le parsing de signature fonctionne mieux avec des signatures structurées (texte, pas image)
- L'add-in Office nécessite HTTPS (même en développement local)
