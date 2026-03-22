import React from 'react'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

export default function Charts({ labels = [], data = [], title = '速度曲线' }) {
  const chartData = {
    labels,
    datasets: [{
      label: title,
      data,
      borderColor: 'rgba(75,192,192,1)',
      backgroundColor: 'rgba(75,192,192,0.2)'
    }]
  }
  
  const chartOptions = {
    scales: {
      x: {
        ticks: {
          color: '#fff',
          font: {
            size: 13,
            weight: 500
          }
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      y: {
        ticks: {
          color: '#fff',
          font: {
            size: 13,
            weight: 500
          }
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    plugins: {
      legend: {
        labels: {
          color: '#fff',
          font: {
            size: 14,
            weight: 600
          }
        }
      },
      tooltip: {
        bodyFont: {
          size: 13
        },
        titleFont: {
          size: 14,
          weight: 600
        }
      }
    }
  }

  return <div style={{maxWidth:800}}><Line data={chartData} options={chartOptions} /></div>
}
