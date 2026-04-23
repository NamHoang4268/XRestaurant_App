/**
 * Lambda Function: Bedrock Query Handler
 * 
 * Handles queries to Bedrock Knowledge Base and returns results
 * Trigger: API Gateway POST /api/bedrock/query
 */

const { BedrockAgentRuntimeClient, RetrieveCommand, RetrieveAndGenerateCommand } = require('@aws-sdk/client-bedrock-agent-runtime');

const client = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID;
const MODEL_ARN = process.env.MODEL_ARN || 'arn:aws:bedrock:ap-southeast-1::foundation-model/anthropic.claude-v2';

/**
 * Lambda handler
 */
exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    try {
        // Parse request body
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        const { query, useGenerate = false } = body;
        
        if (!query) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Query is required'
                })
            };
        }
        
        console.log(`Processing query: ${query}`);
        console.log(`Use generate: ${useGenerate}`);
        
        let result;
        
        if (useGenerate) {
            // Use RetrieveAndGenerate for AI-generated response
            result = await retrieveAndGenerate(query);
        } else {
            // Use Retrieve for raw retrieval results
            result = await retrieve(query);
        }
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                query: query,
                results: result,
                timestamp: new Date().toISOString()
            })
        };
        
    } catch (error) {
        console.error('Error processing query:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};

/**
 * Retrieve documents from Knowledge Base
 */
async function retrieve(query) {
    console.log('Calling Bedrock Retrieve API');
    
    const command = new RetrieveCommand({
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        retrievalQuery: {
            text: query
        },
        retrievalConfiguration: {
            vectorSearchConfiguration: {
                numberOfResults: 5
            }
        }
    });
    
    const response = await client.send(command);
    
    console.log(`Retrieved ${response.retrievalResults?.length || 0} results`);
    
    // Extract and format results
    const results = response.retrievalResults?.map(result => ({
        text: result.content?.text,
        score: result.score,
        source: result.location?.s3Location?.uri,
        metadata: result.metadata
    })) || [];
    
    // Log scores
    const scores = results.map(r => r.score);
    console.log(`Scores: [${scores.join(', ')}]`);
    
    return {
        type: 'retrieve',
        count: results.length,
        results: results
    };
}

/**
 * Retrieve and generate AI response
 */
async function retrieveAndGenerate(query) {
    console.log('Calling Bedrock RetrieveAndGenerate API');
    
    const command = new RetrieveAndGenerateCommand({
        input: {
            text: query
        },
        retrieveAndGenerateConfiguration: {
            type: 'KNOWLEDGE_BASE',
            knowledgeBaseConfiguration: {
                knowledgeBaseId: KNOWLEDGE_BASE_ID,
                modelArn: MODEL_ARN
            }
        }
    });
    
    const response = await client.send(command);
    
    console.log('Generated response');
    
    // Extract citations
    const citations = response.citations?.map(citation => ({
        text: citation.generatedResponsePart?.textResponsePart?.text,
        sources: citation.retrievedReferences?.map(ref => ({
            text: ref.content?.text,
            source: ref.location?.s3Location?.uri
        }))
    })) || [];
    
    return {
        type: 'retrieve_and_generate',
        output: response.output?.text,
        citations: citations,
        sessionId: response.sessionId
    };
}
