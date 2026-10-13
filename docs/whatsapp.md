# Codes de vérification par WhatsApp

CargoConnect envoie les codes (vérification du numéro, mot de passe oublié) avec l'**API WhatsApp Cloud**
de Meta, au moyen d'un modèle de message de catégorie **Authentification** avec un bouton « Copier le code ».

En développement, aucun message n'est envoyé : le code s'affiche dans le terminal de `runserver`
(`OTP_BACKEND=apps.accounts.otp_delivery.ConsoleBackend`, valeur par défaut).

## 1. Créer le compte et l'application Meta

1. Créez (ou utilisez) un **portefeuille Meta Business** sur business.facebook.com.
   Pour la production, faites vérifier l'entreprise (documents légaux de la société).
2. Sur developers.facebook.com, créez une application de type **Business** et ajoutez le produit **WhatsApp**.
3. Dans **WhatsApp > Configuration de l'API**, notez le **Phone number ID** (identifiant du numéro
   expéditeur ; ce n'est pas le numéro lui-même).
   - Pour tester, Meta fournit un numéro de test qui ne peut écrire qu'à quelques numéros
     destinataires que vous déclarez.
   - Pour la production, ajoutez votre propre numéro professionnel. Il ne doit pas être déjà utilisé
     dans l'application WhatsApp classique.

## 2. Obtenir un jeton d'accès permanent

Le jeton affiché sur la page de démarrage expire au bout de 24 h. Pour la production :

1. Ouvrez **Paramètres de l'entreprise > Utilisateurs système** et créez un utilisateur système (rôle administrateur).
2. Attribuez-lui l'application et le compte WhatsApp Business.
3. Générez un jeton avec la permission `whatsapp_business_messaging`.

Ce jeton est un secret : il va uniquement dans le `.env` du serveur, jamais dans le dépôt Git ni dans l'application mobile.

## 3. Créer le modèle de message

Dans le **WhatsApp Manager**, ouvrez **Modèles de message > Créer un modèle** :

| Champ | Valeur |
|---|---|
| Catégorie | Authentification |
| Type | Code à usage unique, bouton **Copier le code** |
| Nom | `cargoconnect_code` |
| Langue | Français (`fr`) |
| Recommandation de sécurité | activée (« Pour votre sécurité, ne partagez pas ce code ») |
| Expiration du code | 10 minutes (identique à `OTP_TTL_MINUTES`) |

Le texte des modèles d'authentification est imposé par Meta : « *{code}* est votre code de vérification ».
Attendez que le modèle soit **approuvé** avant de passer en production.

## 4. Configurer le backend

Dans `backend/.env` :

```
OTP_BACKEND=apps.accounts.otp_delivery.WhatsAppCloudBackend
WHATSAPP_ACCESS_TOKEN=<jeton de l'utilisateur système>
WHATSAPP_PHONE_NUMBER_ID=<Phone number ID>
WHATSAPP_TEMPLATE_NAME=cargoconnect_code
WHATSAPP_TEMPLATE_LANGUAGE=fr
```

Redémarrez le serveur, puis testez depuis l'application : **Profil > Recevoir le code sur WhatsApp**.

## Comportement et erreurs

- Si WhatsApp refuse l'envoi (numéro sans compte WhatsApp, modèle non approuvé, jeton expiré...),
  l'API répond `503 otp_unavailable` et le code généré est supprimé. L'erreur détaillée de Meta est
  écrite dans les logs du serveur.
- Le destinataire doit avoir WhatsApp sur ce numéro. Si besoin, on pourra ajouter plus tard un repli
  par SMS : il suffit d'écrire un second backend.
- La facturation se fait par message d'authentification, avec un tarif qui dépend du pays.
  Consultez la grille tarifaire officielle de Meta pour le Maroc.
