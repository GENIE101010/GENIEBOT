const { cmd, commands } = require('../lib');
const config = require('../config');
const { getBuffer, getGroupAdmins, parsedJid } = require('../lib');
const puppeteer = require('puppeteer');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// Configuration Coupe Facile
const COUPE_FACILE_CONFIG = {
    url: 'https://coupe-facile.com', // Remplacez par l'URL réelle
    loginUrl: 'https://coupe-facile.com/login',
    username: process.env.COUPE_FACILE_USERNAME || 'votre_username',
    password: process.env.COUPE_FACILE_PASSWORD || 'votre_password',
    tournamentId: process.env.TOURNAMENT_ID || 'votre_tournament_id'
};

// Stockage des groupes actifs
let activeGroups = new Map();

// Classe principale du bot Coupe Facile
class CoupeFacileBot {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
        this.playerMentions = new Map(); // Stockage des mentions des joueurs
    }

    // Initialisation du navigateur
    async initBrowser() {
        try {
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1920, height: 1080 });
            console.log('🚀 Navigateur Coupe Facile initialisé');
        } catch (error) {
            console.error('❌ Erreur initialisation navigateur:', error);
        }
    }

    // Connexion automatique à Coupe Facile
    async login() {
        try {
            if (!this.page) await this.initBrowser();
            
            await this.page.goto(COUPE_FACILE_CONFIG.loginUrl);
            await this.page.waitForSelector('input[name="username"], input[name="email"]');
            
            // Saisir les identifiants
            await this.page.type('input[name="username"], input[name="email"]', COUPE_FACILE_CONFIG.username);
            await this.page.type('input[name="password"]', COUPE_FACILE_CONFIG.password);
            
            // Cliquer sur connexion
            await this.page.click('button[type="submit"], input[type="submit"]');
            await this.page.waitForNavigation();
            
            this.isLoggedIn = true;
            console.log('✅ Connexion réussie à Coupe Facile');
            
            // Naviguer vers le tournoi
            await this.page.goto(`${COUPE_FACILE_CONFIG.url}/tournament/${COUPE_FACILE_CONFIG.tournamentId}`);
            
        } catch (error) {
            console.error('❌ Erreur connexion Coupe Facile:', error);
            this.isLoggedIn = false;
        }
    }

    // Capture d'écran du classement
    async captureClassement() {
        try {
            if (!this.isLoggedIn) await this.login();
            
            // Attendre que le classement soit chargé
            await this.page.waitForSelector('.classement, .ranking, .leaderboard');
            
            const element = await this.page.$('.classement, .ranking, .leaderboard');
            const screenshot = await element.screenshot();
            
            const filename = `classement_${Date.now()}.png`;
            const filepath = path.join(__dirname, '../temp', filename);
            
            fs.writeFileSync(filepath, screenshot);
            return filepath;
            
        } catch (error) {
            console.error('❌ Erreur capture classement:', error);
            return null;
        }
    }

    // Capture d'écran des matchs du jour
    async captureMatchsDuJour() {
        try {
            if (!this.isLoggedIn) await this.login();
            
            await this.page.waitForSelector('.matchs-jour, .today-matches, .daily-matches');
            
            const element = await this.page.$('.matchs-jour, .today-matches, .daily-matches');
            const screenshot = await element.screenshot();
            
            const filename = `matchs_jour_${Date.now()}.png`;
            const filepath = path.join(__dirname, '../temp', filename);
            
            fs.writeFileSync(filepath, screenshot);
            return filepath;
            
        } catch (error) {
            console.error('❌ Erreur capture matchs du jour:', error);
            return null;
        }
    }

    // Capture d'écran des matchs non joués
    async captureMatchsNonJoues() {
        try {
            if (!this.isLoggedIn) await this.login();
            
            await this.page.waitForSelector('.matchs-non-joues, .pending-matches, .unplayed-matches');
            
            const element = await this.page.$('.matchs-non-joues, .pending-matches, .unplayed-matches');
            const screenshot = await element.screenshot();
            
            const filename = `matchs_non_joues_${Date.now()}.png`;
            const filepath = path.join(__dirname, '../temp', filename);
            
            fs.writeFileSync(filepath, screenshot);
            
            // Extraire les joueurs concernés
            const players = await this.extractPlayersFromPendingMatches();
            
            return { filepath, players };
            
        } catch (error) {
            console.error('❌ Erreur capture matchs non joués:', error);
            return null;
        }
    }

    // Extraire les joueurs des matchs non joués
    async extractPlayersFromPendingMatches() {
        try {
            const players = await this.page.evaluate(() => {
                const matchElements = document.querySelectorAll('.match-pending, .match-unplayed');
                const playerList = [];
                
                matchElements.forEach(match => {
                    const player1 = match.querySelector('.player1, .joueur1')?.textContent?.trim();
                    const player2 = match.querySelector('.player2, .joueur2')?.textContent?.trim();
                    
                    if (player1) playerList.push(player1);
                    if (player2) playerList.push(player2);
                });
                
                return [...new Set(playerList)]; // Supprimer les doublons
            });
            
            return players;
        } catch (error) {
            console.error('❌ Erreur extraction joueurs:', error);
            return [];
        }
    }

    // Analyser une capture de score avec OCR
    async analyzeScoreCapture(imagePath) {
        try {
            const { data: { text } } = await Tesseract.recognize(imagePath, 'fra');
            
            // Patterns pour extraire le score
            const scorePattern = /(\w+)\s*(?:vs?|contre)\s*(\w+)\s*[:\-]?\s*(\d+)\s*[:\-]\s*(\d+)/i;
            const match = text.match(scorePattern);
            
            if (match) {
                return {
                    player1: match[1].trim(),
                    player2: match[2].trim(),
                    score1: parseInt(match[3]),
                    score2: parseInt(match[4])
                };
            }
            
            return null;
        } catch (error) {
            console.error('❌ Erreur analyse OCR:', error);
            return null;
        }
    }

    // Enregistrer un score sur Coupe Facile
    async submitScore(player1, player2, score1, score2) {
        try {
            if (!this.isLoggedIn) await this.login();
            
            // Chercher le match correspondant
            await this.page.waitForSelector('.match-item, .match-row');
            
            const matchFound = await this.page.evaluate((p1, p2) => {
                const matches = document.querySelectorAll('.match-item, .match-row');
                
                for (let match of matches) {
                    const text = match.textContent.toLowerCase();
                    if ((text.includes(p1.toLowerCase()) && text.includes(p2.toLowerCase())) ||
                        (text.includes(p2.toLowerCase()) && text.includes(p1.toLowerCase()))) {
                        
                        const scoreButton = match.querySelector('.score-button, .enter-score, .add-score');
                        if (scoreButton) {
                            scoreButton.click();
                            return true;
                        }
                    }
                }
                return false;
            }, player1, player2);
            
            if (matchFound) {
                // Attendre le formulaire de score
                await this.page.waitForSelector('input[name="score1"], input[name="player1_score"]');
                
                // Saisir les scores
                await this.page.type('input[name="score1"], input[name="player1_score"]', score1.toString());
                await this.page.type('input[name="score2"], input[name="player2_score"]', score2.toString());
                
                // Valider
                await this.page.click('button[type="submit"], .submit-score');
                
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('❌ Erreur soumission score:', error);
            return false;
        }
    }

    // Nettoyer les ressources
    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// Instance globale du bot
const coupeFacileBot = new CoupeFacileBot();

// Créer le dossier temp s'il n'existe pas
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// Fonction pour envoyer une image avec mention
async function sendImageWithMention(message, imagePath, caption, mentions = []) {
    try {
        const buffer = fs.readFileSync(imagePath);
        
        let mentionText = '';
        if (mentions.length > 0) {
            mentionText = mentions.map(player => `@${player}`).join(' ');
        }
        
        const fullCaption = `${caption}\n\n${mentionText}`;
        
        await message.sendMessage(message.jid, buffer, {
            caption: fullCaption,
            contextInfo: {
                mentionedJid: mentions.map(player => `${player}@s.whatsapp.net`)
            }
        }, 'image');
        
        // Nettoyer le fichier temporaire
        fs.unlinkSync(imagePath);
        
    } catch (error) {
        console.error('❌ Erreur envoi image:', error);
    }
}

// Commande: !score (avec image)
cmd({
    pattern: 'score',
    desc: 'Analyser une capture de score et l\'enregistrer',
    category: 'coupe-facile',
    filename: __filename
}, async (conn, mek, m, { from, reply, isGroup }) => {
    if (!isGroup) return reply('❌ Cette commande ne fonctionne que dans les groupes');
    
    try {
        // Vérifier si une image est présente
        if (!mek.message.imageMessage) {
            return reply('📸 Veuillez envoyer une image de score avec la commande !score');
        }
        
        reply('🔍 Analyse de la capture en cours...');
        
        // Télécharger l'image
        const buffer = await getBuffer(mek.message.imageMessage);
        const imagePath = path.join(tempDir, `score_${Date.now()}.jpg`);
        fs.writeFileSync(imagePath, buffer);
        
        // Analyser avec OCR
        const scoreData = await coupeFacileBot.analyzeScoreCapture(imagePath);
        
        if (scoreData) {
            reply(`📊 Score détecté:\n${scoreData.player1} vs ${scoreData.player2}\n${scoreData.score1} - ${scoreData.score2}`);
            
            // Enregistrer sur Coupe Facile
            const success = await coupeFacileBot.submitScore(
                scoreData.player1, 
                scoreData.player2, 
                scoreData.score1, 
                scoreData.score2
            );
            
            if (success) {
                reply('✅ Score enregistré avec succès sur Coupe Facile!');
            } else {
                reply('❌ Erreur lors de l\'enregistrement du score');
            }
        } else {
            reply('❌ Impossible d\'analyser le score. Vérifiez la qualité de l\'image.');
        }
        
        // Nettoyer
        fs.unlinkSync(imagePath);
        
    } catch (error) {
        console.error('❌ Erreur commande score:', error);
        reply('❌ Erreur lors de l\'analyse du score');
    }
});

// Commande: !matchs
cmd({
    pattern: 'matchs',
    desc: 'Afficher les matchs du jour',
    category: 'coupe-facile',
    filename: __filename
}, async (conn, mek, m, { from, reply, isGroup }) => {
    if (!isGroup) return reply('❌ Cette commande ne fonctionne que dans les groupes');
    
    try {
        reply('📅 Récupération des matchs du jour...');
        
        const imagePath = await coupeFacileBot.captureMatchsDuJour();
        
        if (imagePath) {
            await sendImageWithMention(m, imagePath, '📅 Matchs du jour');
        } else {
            reply('❌ Erreur lors de la récupération des matchs');
        }
        
    } catch (error) {
        console.error('❌ Erreur commande matchs:', error);
        reply('❌ Erreur lors de la récupération des matchs');
    }
});

// Commande: !classement
cmd({
    pattern: 'classement',
    desc: 'Afficher le classement',
    category: 'coupe-facile',
    filename: __filename
}, async (conn, mek, m, { from, reply, isGroup }) => {
    if (!isGroup) return reply('❌ Cette commande ne fonctionne que dans les groupes');
    
    try {
        reply('📊 Récupération du classement...');
        
        const imagePath = await coupeFacileBot.captureClassement();
        
        if (imagePath) {
            await sendImageWithMention(m, imagePath, '📊 Classement actuel');
        } else {
            reply('❌ Erreur lors de la récupération du classement');
        }
        
    } catch (error) {
        console.error('❌ Erreur commande classement:', error);
        reply('❌ Erreur lors de la récupération du classement');
    }
});

// Commande: !rappel
cmd({
    pattern: 'rappel',
    desc: 'Rappeler les matchs non joués',
    category: 'coupe-facile',
    filename: __filename
}, async (conn, mek, m, { from, reply, isGroup }) => {
    if (!isGroup) return reply('❌ Cette commande ne fonctionne que dans les groupes');
    
    try {
        reply('⏰ Vérification des matchs non joués...');
        
        const result = await coupeFacileBot.captureMatchsNonJoues();
        
        if (result && result.filepath) {
            const caption = '⏰ Rappel - Matchs non joués\n⏳ Pensez à jouer vos matchs!';
            await sendImageWithMention(m, result.filepath, caption, result.players);
        } else {
            reply('✅ Tous les matchs sont joués!');
        }
        
    } catch (error) {
        console.error('❌ Erreur commande rappel:', error);
        reply('❌ Erreur lors du rappel des matchs');
    }
});

// Commande: !résumé
cmd({
    pattern: 'résumé',
    desc: 'Résumé complet de la journée',
    category: 'coupe-facile',
    filename: __filename
}, async (conn, mek, m, { from, reply, isGroup }) => {
    if (!isGroup) return reply('❌ Cette commande ne fonctionne que dans les groupes');
    
    try {
        reply('📋 Génération du résumé...');
        
        // Classement
        const classementPath = await coupeFacileBot.captureClassement();
        if (classementPath) {
            await sendImageWithMention(m, classementPath, '📊 Classement actuel');
        }
        
        // Matchs du jour
        const matchsPath = await coupeFacileBot.captureMatchsDuJour();
        if (matchsPath) {
            await sendImageWithMention(m, matchsPath, '📅 Matchs du jour');
        }
        
        // Matchs non joués
        const rappelResult = await coupeFacileBot.captureMatchsNonJoues();
        if (rappelResult && rappelResult.filepath) {
            const caption = '⏰ Matchs à jouer';
            await sendImageWithMention(m, rappelResult.filepath, caption, rappelResult.players);
        }
        
    } catch (error) {
        console.error('❌ Erreur commande résumé:', error);
        reply('❌ Erreur lors de la génération du résumé');
    }
});

// Commande: !coupe-start
cmd({
    pattern: 'coupe-start',
    desc: 'Activer le bot Coupe Facile pour ce groupe',
    category: 'coupe-facile',
    filename: __filename
}, async (conn, mek, m, { from, reply, isGroup, isGroupAdmins }) => {
    if (!isGroup) return reply('❌ Cette commande ne fonctionne que dans les groupes');
    if (!isGroupAdmins) return reply('❌ Seuls les administrateurs peuvent activer le bot');
    
    try {
        activeGroups.set(from, true);
        reply('✅ Bot Coupe Facile activé pour ce groupe!\n\nCommandes disponibles:\n• !score (avec image)\n• !matchs\n• !classement\n• !rappel\n• !résumé\n• !coupe-stop');
        
        // Initialiser le bot
        await coupeFacileBot.initBrowser();
        
    } catch (error) {
        console.error('❌ Erreur activation bot:', error);
        reply('❌ Erreur lors de l\'activation du bot');
    }
});

// Commande: !coupe-stop
cmd({
    pattern: 'coupe-stop',
    desc: 'Désactiver le bot Coupe Facile pour ce groupe',
    category: 'coupe-facile',
    filename: __filename
}, async (conn, mek, m, { from, reply, isGroup, isGroupAdmins }) => {
    if (!isGroup) return reply('❌ Cette commande ne fonctionne que dans les groupes');
    if (!isGroupAdmins) return reply('❌ Seuls les administrateurs peuvent désactiver le bot');
    
    try {
        activeGroups.delete(from);
        reply('✅ Bot Coupe Facile désactivé pour ce groupe');
        
    } catch (error) {
        console.error('❌ Erreur désactivation bot:', error);
        reply('❌ Erreur lors de la désactivation du bot');
    }
});

// Tâche automatique - Rappels toutes les heures
cron.schedule('0 * * * *', async () => {
    try {
        console.log('🔄 Vérification automatique des matchs non joués...');
        
        for (let [groupId, isActive] of activeGroups) {
            if (isActive) {
                const result = await coupeFacileBot.captureMatchsNonJoues();
                
                if (result && result.filepath && result.players.length > 0) {
                    const caption = '⏰ Rappel automatique - Matchs non joués\n⏳ Il est temps de jouer!';
                    
                    // Envoyer dans le groupe
                    const buffer = fs.readFileSync(result.filepath);
                    const mentionText = result.players.map(player => `@${player}`).join(' ');
                    
                    await conn.sendMessage(groupId, buffer, {
                        caption: `${caption}\n\n${mentionText}`,
                        contextInfo: {
                            mentionedJid: result.players.map(player => `${player}@s.whatsapp.net`)
                        }
                    }, 'image');
                    
                    fs.unlinkSync(result.filepath);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Erreur tâche automatique:', error);
    }
});

// Tâche automatique - Résumé quotidien à 20h
cron.schedule('0 20 * * *', async () => {
    try {
        console.log('📋 Génération du résumé quotidien...');
        
        for (let [groupId, isActive] of activeGroups) {
            if (isActive) {
                // Envoyer résumé complet
                const classementPath = await coupeFacileBot.captureClassement();
                const matchsPath = await coupeFacileBot.captureMatchsDuJour();
                
                if (classementPath) {
                    const buffer = fs.readFileSync(classementPath);
                    await conn.sendMessage(groupId, buffer, {
                        caption: '📊 Résumé du jour - Classement'
                    }, 'image');
                    fs.unlinkSync(classementPath);
                }
                
                if (matchsPath) {
              
