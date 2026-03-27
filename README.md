# Email to vCard - Browser Extension

Extension navigateur (Chrome / Edge) qui ajoute un bouton **"vCard"** dans Gmail et Outlook Web pour créer automatiquement une fiche contact (.vcf) à partir de l'expéditeur et de sa signature.

## Fonctionnalités

- **Extraction automatique** : nom, email, téléphone, mobile, société, fonction, adresse, site web
- **Parsing intelligent de la signature** : détecte les formats courants (FR et EN)
- **Aperçu éditable** : prévisualisation et modification des champs avant téléchargement
- **Compatible** : Gmail, Outlook.com, Office 365

## Installation

### Mode développeur (Chrome / Edge)

1. Ouvrir `chrome://extensions/` (ou `edge://extensions/`)
2. Activer le **Mode développeur** (en haut à droite)
3. Cliquer sur **"Charger l'extension non empaquetée"**
4. Sélectionner le dossier racine de ce projet

### Générer les icônes

L'extension nécessite des icônes PNG dans le dossier `icons/`. Vous pouvez :
- Utiliser les fichiers SVG fournis dans `icons/` comme base
- Ou remplacer par vos propres icônes aux tailles 16x16, 48x48 et 128x128

## Utilisation

1. Ouvrir Gmail ou Outlook Web
2. Ouvrir un email
3. Cliquer sur le bouton **vCard** (dans la barre d'outils ou en bas à droite)
4. Vérifier/modifier les informations extraites dans la fenêtre de prévisualisation
5. Cliquer sur **"Télécharger .vcf"**
6. Le fichier `.vcf` peut être importé dans n'importe quel gestionnaire de contacts

## Structure du projet

```
├── manifest.json              # Extension manifest (v3)
├── src/
│   ├── signature-parser.js    # Extraction d'infos depuis les signatures
│   ├── vcard-generator.js     # Génération du format vCard 3.0
│   ├── content-gmail.js       # Intégration spécifique Gmail
│   ├── content-outlook.js     # Intégration spécifique Outlook Web
│   ├── main.js                # Orchestration et UI
│   └── styles.css             # Styles du bouton et de la modale
└── icons/
    └── *.svg                  # Icônes de l'extension
```

## Limitations

- Les sélecteurs CSS des webmails peuvent changer lors de mises à jour de Gmail/Outlook
- Le parsing de signature fonctionne mieux avec des signatures structurées
- Certaines signatures en image ne peuvent pas être analysées
