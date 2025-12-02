
import { Payment } from "../types";

// JSONBin.io API Base URL
const BASE_URL = 'https://api.jsonbin.io/v3/b';

export const fetchCloudData = async (binId: string, apiKey: string): Promise<Payment[] | null> => {
  try {
    const response = await fetch(`${BASE_URL}/${binId}/latest`, {
      method: 'GET',
      headers: {
        'X-Master-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Cloud fetch failed');
    }

    const result = await response.json();
    // JSONBin returns data wrapped in record
    return result.record as Payment[];
  } catch (error) {
    console.error("Cloud Fetch Error:", error);
    return null;
  }
};

export const updateCloudData = async (binId: string, apiKey: string, data: Payment[]): Promise<boolean> => {
  try {
    const response = await fetch(`${BASE_URL}/${binId}`, {
      method: 'PUT',
      headers: {
        'X-Master-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    return response.ok;
  } catch (error) {
    console.error("Cloud Update Error:", error);
    return false;
  }
};

export const createCloudBin = async (apiKey: string, data: Payment[]): Promise<string | null> => {
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'X-Master-Key': apiKey,
        'Content-Type': 'application/json',
        'X-Bin-Name': 'OdemeTakipcisi_Data'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Bin creation failed');
    }

    const result = await response.json();
    return result.metadata.id;
  } catch (error) {
    console.error("Cloud Create Error:", error);
    return null;
  }
};
