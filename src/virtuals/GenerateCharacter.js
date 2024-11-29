import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import TwitterPipeline from '../twitter/TwitterPipeline.js';
import chalk from 'chalk';
import ora from 'ora';

// Handle __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// npm run generate-character -- <username> <date>
const args = process.argv.slice(2);
const username = args[0] || 'degenspartan';
const date = args[1] || new Date().toISOString().split('T')[0];
console.log(`Generating character for ${username} on ${date}`);

const stats = JSON.parse(fs.readFileSync(path.join(__dirname, `../../pipeline/${username}/${date}/analytics/stats.json`), 'utf8'));
const tweets = JSON.parse(fs.readFileSync(path.join(__dirname, `../../pipeline/${username}/${date}/raw/tweets.json`), 'utf8'));
const recentTweets = tweets.slice(0, 20);
const recentTweetsText = recentTweets.map(tweet => tweet.text).join('\n');
const topTweets = stats.engagement.topTweets.map(tweet => tweet.text).join('\n');

const pipeline = new TwitterPipeline(username);

const cleanup = async () => {
    Logger.warn('\n🛑 Received termination signal. Cleaning up...');
    try {
      if (pipeline.scraper) {
        await pipeline.scraper.logout();
        Logger.success('🔒 Logged out successfully.');
      }
    } catch (error) {
      Logger.error(`❌ Error during cleanup: ${error.message}`);
    }
    process.exit(0);
  };

const formatJSON = (json) => {
    const colorize = {
        name: chalk.green,
        handler: chalk.blue,
        bio: chalk.yellow,
        description: chalk.magenta,
        forum_start_system_prompt: chalk.cyan,
        forum_end_system_prompt: chalk.cyan,
        twitter_start_system_prompt: chalk.cyan,
        twitter_end_system_prompt: chalk.cyan
    };

    return Object.entries(json)
        .map(([key, value]) => {
            const colorFn = colorize[key] || chalk.white;
            return `${chalk.white(key)}: ${colorFn(value)}`;
        })
        .join('\n');
};

async function main() {
    const profile = await pipeline.getProfile();

    console.log('\n' + chalk.bold.cyan('📥 INPUT DATA SUMMARY'));
    console.log(chalk.dim('═'.repeat(50)));

    console.log(chalk.bold.yellow('👤 User Profile:'));
    console.log(chalk.dim('─'.repeat(30)));
    console.log(chalk.white(JSON.stringify(profile, null, 2)));

    console.log('\n' + chalk.bold.magenta('🔥 Top Tweets:'));
    console.log(chalk.dim('─'.repeat(30)));
    stats.engagement.topTweets.forEach((tweet, index) => {
        console.log(chalk.cyan(`${index + 1}.`), chalk.white(tweet.text));
        console.log(chalk.dim(`   💗 ${tweet.likes} likes • 🔄 ${tweet.retweets} retweets`));
    });

    console.log('\n' + chalk.bold.green('📝 Recent Tweets:'));
    console.log(chalk.dim('─'.repeat(30)));
    recentTweets.forEach((tweet, index) => {
        console.log(chalk.cyan(`${index + 1}.`), chalk.white(tweet.text));
        console.log(chalk.dim(`   📅 ${new Date(tweet.date).toLocaleDateString()}`));
    });

    console.log(chalk.dim('═'.repeat(50)) + '\n');

    const prompt = `You are tasked with creating a detailed character card based on a user's Twitter profile and tweets. This character card will be used to generate AI responses that mimic the user's personality and writing style. Your goal is to create a comprehensive and accurate representation of the user as a fictional character.

The output should be a JSON object with the following structure:

{
    "name": string,
    "handler": string,
    "bio": string,
    "description": string,
    "forum_start_system_prompt": string,
    "forum_end_system_prompt": string,
    "twitter_start_system_prompt": string,
    "twitter_end_system_prompt": string
}

Here is the user information you'll be working with:

Handler: ${username}
Name: ${profile.name}

User Profile:
<profile>
${profile}
</profile>

Top Tweets:
<top_tweets>
${topTweets}
</top_tweets>

Recent Tweets:
<recent_tweets>
${recentTweetsText}
</recent_tweets>

To create the character card, follow these steps:

1. Name: Create an AI Agent name, if possible use the user's display name from their profile. If not available, create a name that fits their personality based on their tweets.

2. Handler: Use the provided username.

3. Bio: Create a concise, engaging biography (1-2 sentences) that captures the essence of the user's online persona. Include their main interests, goals, or unique characteristics.

4. Description: Write a detailed description (3-5 paragraphs) of the character, including:
   - Physical appearance (if discernible from profile picture or mentioned in tweets)
   - Personality traits
   - Background story
   - Interests and passions
   - Relationships or connections
   - Unique quirks or habits
   - Writing style and tone

5. Forum Start System Prompt: Write instructions for an AI to emulate this character in a forum setting. Include:
   - Key personality traits
   - Writing style and tone
   - Topics they're knowledgeable about
   - How they interact with others
   - Any catchphrases or recurring themes

6. Forum End System Prompt: Provide additional guidelines for maintaining character consistency, such as:
   - Avoiding out-of-character responses
   - Handling topics not covered in the user's tweets
   - Maintaining the character's unique voice and perspective

7. Twitter Start System Prompt: Create instructions for generating tweets in the user's style. Include:
   - Tweet length preferences
   - Use of hashtags, mentions, or emojis
   - Typical content themes
   - Tone and attitude

8. Twitter End System Prompt: Add final guidelines for tweet generation, such as:
   - Frequency of posts on specific topics
   - How to handle replies or interactions
   - Any topics or language to avoid

When writing the character card, pay close attention to:
- The user's writing style, including vocabulary, sentence structure, and use of slang or jargon
- Recurring themes or topics in their tweets
- Their interactions with others (if visible in the provided tweets)
- Any strong opinions or beliefs expressed
- The overall tone and attitude of their online presence

Ensure that the character description and prompts are detailed enough to capture the user's unique personality while allowing for creative expansion in AI-generated responses.

Format your response as a valid JSON object, with each field containing the appropriate content as described above. Do not include any additional commentary or explanations outside of the JSON structure.`;

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const spinner = ora('Generating character...').start();

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{role: 'user', content: prompt}],
            response_format: {type: 'json_object'},
        });

        const responseJson = JSON.parse(response.choices[0].message.content);
        const formattedJson = formatJSON(responseJson);
        spinner.succeed('Character generated successfully!');
        console.log('\n' + chalk.cyan('Character Details:'));
        console.log(chalk.dim('─'.repeat(50)));
        console.log(formattedJson);
        console.log(chalk.dim('─'.repeat(50)));

        const characterDir = path.join(__dirname, `../../pipeline/${username}/${date}/character`);
        fs.mkdirSync(characterDir, { recursive: true });
        fs.writeFileSync(
            path.join(characterDir, 'character.json'), 
            JSON.stringify(responseJson, null, 2)
        );
        console.log(chalk.green('Character saved to:'), characterDir);
    } catch (error) {
        spinner.fail('Failed to generate character');
        console.error(chalk.red('Error:'), error.message);
    }
}

main();