const express = require('express');
const axios = require('axios');
const Redis = require('ioredis');
const app = express();
const PORT = 3000;

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  retryStrategy: (times) => {
    console.log(`Tentando reconectar ao Redis... tentativa ${times}`);
    return Math.min(times * 50, 2000);
  }
});

redis.on('connect', () => {
  console.log('Conectado ao Redis');
});

redis.on('error', (err) => {
  console.error('Erro no Redis:', err);
});

const JAVA_API_URL = 'http://localhost:8080/weather';

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

const generateRecomendation = (temperature) => {
  if (temperature > 30) {
    return "Está muito quente! Recomendamos: hidratação constante e protetor solar.";
  } else if (temperature >= 15 && temperature <= 30) {
    return "Clima agradável! Ótimo dia para atividades ao ar livre.";
  } else {
    return "Está frio! Recomendamos usar um casaco e se agasalhar bem.";
  }
};

app.get('/recommendation/:city', async (req, res) => {
  try {
    const { city } = req.params;
    const cacheKey = `recomendation:${city.toLowerCase()}`;

    const cachedRecommendation = await redis.get(cacheKey);

    if (cachedRecommendation) {
      return res.json(JSON.parse(cachedRecommendation));
    }

    const weatherResponse = await axios.get(`${JAVA_API_URL}/${city}`);
    const weatherData = weatherResponse.data;
    let temperature = weatherData.temperature;
    const unit = weatherData.unit?.toLowerCase();

    if (unit === 'fahrenheit') {
      temperature = (temperature - 32) * 5 / 9; // Convertendo Fahrenheit para Celsius
    }

    const recommendation = generateRecomendation(temperature);
    
    const response = {
      city: weatherData.city,
      temperature: weatherData.temperature,
      recommendation: recommendation
    };

    await redis.setex(cacheKey, 3600, JSON.stringify(response)); // Cache por 1 hora (3600 segundos)
    console.log("Resposta:", response);
    res.json(response);
    
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return res.status(404).json({ 
        error: 'Cidade não encontrada',
        suggestion: 'Verifique o nome da cidade ou consulte a lista de cidades disponíveis'
      });
    }
    res.status(500).json({ 
      error: 'Erro ao processar sua solicitação',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor de recomendações rodando em http://localhost:${PORT}`);
});